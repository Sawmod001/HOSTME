-- Migration: Batch 10 — Payment Engine
-- Real Paystack integration, payment_records usage, escrow, refunds

BEGIN;

-- === 1. ADD ESCROW FIELDS TO payment_records ===
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS escrow_status TEXT NOT NULL DEFAULT 'held'
  CHECK (escrow_status IN ('held', 'released', 'refunded', 'partial_refund'));
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS release_reason TEXT;
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS host_payout_kobo INTEGER DEFAULT 0;
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS platform_fee_kobo INTEGER DEFAULT 0;

-- === 2. CREATE escrow_releases TABLE ===
-- Audit trail for every fund release (payout to host or refund to guest)
CREATE TABLE IF NOT EXISTS escrow_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_record_id UUID NOT NULL REFERENCES payment_records(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  release_type TEXT NOT NULL CHECK (release_type IN ('host_payout', 'guest_refund', 'partial_refund')),
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  recipient_id UUID REFERENCES users(id),
  gateway_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_escrow_releases_booking ON escrow_releases (booking_id);
CREATE INDEX IF NOT EXISTS idx_escrow_releases_payment ON escrow_releases (payment_record_id);
CREATE INDEX IF NOT EXISTS idx_escrow_releases_status ON escrow_releases (status);

-- === 3. RLS FOR escrow_releases ===
ALTER TABLE escrow_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY escrow_releases_guest_read ON escrow_releases
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = escrow_releases.booking_id
        AND b.guest_id = auth.uid()
    )
  );

CREATE POLICY escrow_releases_host_read ON escrow_releases
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN listings l ON l.id = b.listing_id
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE b.id = escrow_releases.booking_id
        AND pp.user_id = auth.uid()
    )
  );

CREATE POLICY escrow_releases_admin_all ON escrow_releases
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- === 4. FUNCTION: release_escrow ===
-- Called when a booking is completed. Releases funds to host.
CREATE OR REPLACE FUNCTION release_escrow(
  p_booking_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment RECORD;
  v_release_id UUID;
  v_host_payout INTEGER;
  v_platform_fee INTEGER;
BEGIN
  -- Find the successful payment for this booking
  SELECT id, amount_kobo, escrow_status, host_payout_kobo, platform_fee_kobo
  INTO v_payment
  FROM payment_records
  WHERE booking_id = p_booking_id
    AND status = 'successful'
    AND escrow_status = 'held'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No held payment found for this booking');
  END IF;

  -- Calculate host payout (total - platform fee)
  -- Platform fee: 5% of total
  v_platform_fee := ROUND(v_payment.amount_kobo * 0.05);
  v_host_payout := v_payment.amount_kobo - v_platform_fee;

  -- Update payment record
  UPDATE payment_records
  SET escrow_status = 'released',
      released_at = now(),
      release_reason = 'booking_completed',
      host_payout_kobo = v_host_payout,
      platform_fee_kobo = v_platform_fee
  WHERE id = v_payment.id;

  -- Create escrow release record
  INSERT INTO escrow_releases (
    payment_record_id, booking_id, release_type,
    amount_kobo, recipient_id, status, reason
  ) VALUES (
    v_payment.id, p_booking_id, 'host_payout',
    v_host_payout, p_actor_id, 'completed', 'booking_completed'
  ) RETURNING id INTO v_release_id;

  -- Notify host
  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  SELECT
    pp.user_id,
    'payout_processed',
    'Payment Released',
    'Your payout of ₦' || ROUND(v_host_payout / 100.0, 2) || ' has been processed.',
    '/host/bookings',
    jsonb_build_object('booking_id', p_booking_id, 'payment_id', v_payment.id, 'release_id', v_release_id)
  FROM listings l
  JOIN provider_profiles pp ON pp.id = l.provider_profile_id
  JOIN bookings b ON b.listing_id = l.id
  WHERE b.id = p_booking_id;

  RETURN jsonb_build_object(
    'ok', true,
    'release_id', v_release_id,
    'host_payout_kobo', v_host_payout,
    'platform_fee_kobo', v_platform_fee
  );
END;
$$;

-- === 5. FUNCTION: refund_booking ===
-- Called when a booking is cancelled and needs a refund.
CREATE OR REPLACE FUNCTION refund_booking(
  p_booking_id UUID,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_reason TEXT DEFAULT 'guest_cancelled'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment RECORD;
  v_booking RECORD;
  v_refund_amount INTEGER;
  v_cancellation_policy TEXT;
  v_nights INTEGER;
  v_hours_until_start NUMERIC;
  v_refund_id UUID;
BEGIN
  -- Fetch booking
  SELECT id, listing_id, guest_id, event_start, event_end, booking_type,
         terms_snapshot, total_amount_kobo
  INTO v_booking
  FROM bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Booking not found');
  END IF;

  -- Fetch successful payment
  SELECT id, amount_kobo, escrow_status
  INTO v_payment
  FROM payment_records
  WHERE booking_id = p_booking_id
    AND status = 'successful'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No successful payment found');
  END IF;

  IF v_payment.escrow_status = 'refunded' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Already refunded');
  END IF;

  -- Calculate time until booking start
  v_hours_until_start := EXTRACT(EPOCH FROM (v_booking.event_start - now())) / 3600;

  -- Get cancellation policy
  v_cancellation_policy := COALESCE(
    (v_booking.terms_snapshot ->> 'cancellationPolicy'),
    'moderate'
  );

  -- Calculate refund amount based on policy
  IF v_booking.booking_type = 'housing' THEN
    v_nights := EXTRACT(DAY FROM (v_booking.event_end - v_booking.event_start));
  ELSE
    v_nights := 0;
  END IF;

  -- Policy rules:
  -- flexible: full refund if > 24h before start
  -- moderate: 50% refund if > 48h before start, else 0%
  -- strict: 0% refund always
  -- non_refundable: 0% refund always
  CASE v_cancellation_policy
    WHEN 'flexible' THEN
      IF v_hours_until_start > 24 THEN
        v_refund_amount := v_payment.amount_kobo;
      ELSE
        v_refund_amount := 0;
      END IF;
    WHEN 'moderate' THEN
      IF v_hours_until_start > 48 THEN
        v_refund_amount := ROUND(v_payment.amount_kobo * 0.5);
      ELSE
        v_refund_amount := 0;
      END IF;
    WHEN 'strict' THEN
      v_refund_amount := 0;
    WHEN 'non_refundable' THEN
      v_refund_amount := 0;
    ELSE
      -- Default to moderate
      IF v_hours_until_start > 48 THEN
        v_refund_amount := ROUND(v_payment.amount_kobo * 0.5);
      ELSE
        v_refund_amount := 0;
      END IF;
  END CASE;

  -- Admin can override to full refund
  IF p_actor_role = 'admin' THEN
    v_refund_amount := v_payment.amount_kobo;
  END IF;

  -- Update payment record
  UPDATE payment_records
  SET escrow_status = CASE
      WHEN v_refund_amount = v_payment.amount_kobo THEN 'refunded'
      WHEN v_refund_amount > 0 THEN 'partial_refund'
      ELSE escrow_status
    END,
    released_at = CASE WHEN v_refund_amount > 0 THEN now() ELSE released_at END,
    release_reason = p_reason
  WHERE id = v_payment.id;

  -- Create refund record
  IF v_refund_amount > 0 THEN
    INSERT INTO refund_records (
      booking_id, payment_record_id, amount_kobo,
      reason, initiated_by, status
    ) VALUES (
      p_booking_id, v_payment.id, v_refund_amount,
      p_reason, p_actor_id, 'completed'
    ) RETURNING id INTO v_refund_id;

    -- Create escrow release record
    INSERT INTO escrow_releases (
      payment_record_id, booking_id, release_type,
      amount_kobo, recipient_id, status, reason
    ) VALUES (
      v_payment.id, p_booking_id, 'guest_refund',
      v_refund_amount, v_booking.guest_id, 'completed', p_reason
    );
  END IF;

  -- Notify guest
  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  VALUES (
    v_booking.guest_id,
    'booking_cancelled',
    'Booking Cancelled',
    CASE
      WHEN v_refund_amount > 0 THEN 'Your booking has been cancelled. A refund of ₦' || ROUND(v_refund_amount / 100.0, 2) || ' will be processed.'
      ELSE 'Your booking has been cancelled. No refund is applicable under the ' || v_cancellation_policy || ' policy.'
    END,
    '/dashboard',
    jsonb_build_object(
      'booking_id', p_booking_id,
      'refund_amount_kobo', v_refund_amount,
      'cancellation_policy', v_cancellation_policy
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'refund_amount_kobo', v_refund_amount,
    'cancellation_policy', v_cancellation_policy,
    'refund_id', v_refund_id
  );
END;
$$;

-- === 6. UPDATED cancel_booking: Integrate refund ===
-- Update the existing cancel_booking function to call refund_booking
CREATE OR REPLACE FUNCTION cancel_booking(
  p_booking_id UUID,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
  v_booking RECORD;
  v_refund_result JSONB;
BEGIN
  -- Attempt the status transition
  v_result := transition_booking_status(p_booking_id, 'cancelled', p_actor_id, p_actor_role, p_reason);

  IF NOT (v_result->>'ok')::boolean THEN
    RETURN v_result;
  END IF;

  -- Fetch booking details for side effects
  SELECT id, listing_id, slot_id, booking_type, event_start, event_end
  INTO v_booking
  FROM bookings
  WHERE id = p_booking_id;

  -- Capacity booking: release the slot
  IF v_booking.booking_type = 'capacity' AND v_booking.slot_id IS NOT NULL THEN
    UPDATE slots
    SET status = 'open',
        reserved_by = NULL,
        reserved_at = NULL
    WHERE id = v_booking.slot_id
      AND status = 'reserved'
      AND reserved_by = p_booking_id;
  END IF;

  -- Housing booking: unblock dates
  IF v_booking.booking_type = 'housing' THEN
    DELETE FROM blocked_dates
    WHERE listing_id = v_booking.listing_id
      AND booking_id = p_booking_id
      AND reason IN ('booking_held', 'booking_confirmed');

    UPDATE tenancy_periods
    SET status = 'available',
        booking_id = NULL
    WHERE listing_id = v_booking.listing_id
      AND booking_id = p_booking_id;
  END IF;

  -- Exclusive lock: release
  IF v_booking.booking_type = 'exclusive' THEN
    UPDATE exclusive_locks
    SET status = 'open',
        booking_id = NULL,
        reserved_by = NULL,
        reserved_at = NULL
    WHERE booking_id = p_booking_id
      AND status = 'reserved';
  END IF;

  -- Process refund if payment exists
  v_refund_result := refund_booking(p_booking_id, p_actor_id, p_actor_role, COALESCE(p_reason, 'booking_cancelled'));

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', p_booking_id,
    'refund', v_refund_result
  );
END;
$$;

-- === 7. INDEXES ===
CREATE INDEX IF NOT EXISTS idx_payment_records_escrow ON payment_records (escrow_status)
  WHERE escrow_status = 'held';

CREATE INDEX IF NOT EXISTS idx_refund_records_booking ON refund_records (booking_id);

COMMIT;
