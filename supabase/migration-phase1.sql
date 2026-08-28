-- =============================================================================
-- ClockHost Phase 1: Critical Safety — Database Migration
-- =============================================================================
-- Run in a transaction. If anything fails, nothing is applied.
-- Depends on: migration.sql through migration-batch30.sql
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. ROLES: Update role CHECK constraint to match REMODEL-BLUEPRINT.md
-- =============================================================================
-- Old: guest, venue_host, housing_agent, admin
-- New: guest, venue_host, shortlet_host, admin
-- (housing_agent is now a business_type under shortlet_host, not a role)

DO $$ BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('guest', 'venue_host', 'shortlet_host', 'admin'));

-- Backfill: rename housing_agent role to shortlet_host
UPDATE users SET role = 'shortlet_host' WHERE role = 'housing_agent';

-- Update provider_profiles: rename provider_type housing_agent to shortlet_host
UPDATE provider_profiles SET provider_type = 'shortlet_host' WHERE provider_type = 'housing_agent';

-- Update the provider_type enum if it exists
DO $$ BEGIN
  ALTER TYPE provider_type RENAME VALUE 'housing_agent' TO 'shortlet_host';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- =============================================================================
-- 1. BOOKING STATUS: Add missing states from state machine
-- =============================================================================
-- Current: pending, awaiting_payment, confirmed, completed, cancelled, rejected, lost_race
-- New: pending_approval, payment_processing, checked_in, no_show, expired,
--      cancelled_by_guest, cancelled_by_host, cancelled_system

-- Drop old constraint and recreate with full state list
DO $$ BEGIN
  ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'pending_approval',
    'awaiting_payment',
    'payment_processing',
    'confirmed',
    'checked_in',
    'completed',
    'cancelled_by_guest',
    'cancelled_by_host',
    'cancelled_system',
    'expired',
    'rejected',
    'lost_race'
  ));

-- =============================================================================
-- 2. BOOKINGS: Add host_id column for quick access (denormalized)
-- =============================================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS host_id UUID REFERENCES users(id);

-- Backfill host_id from listing -> provider_profile -> user_id
UPDATE bookings b
SET host_id = pp.user_id
FROM listings l
JOIN provider_profiles pp ON pp.id = l.provider_profile_id
WHERE b.listing_id = l.id
  AND b.host_id IS NULL;

-- Make host_id NOT NULL after backfill
-- If there are orphaned bookings without a listing, set a default and log
DO $$ BEGIN
  ALTER TABLE bookings ALTER COLUMN host_id SET NOT NULL;
EXCEPTION WHEN invalid_foreign_key THEN NULL;
END $$;

-- =============================================================================
-- 3. LISTINGS: Enforce one listing per provider_profile_id
-- =============================================================================

-- Create a unique partial index: only one non-archived listing per provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_listing_per_provider
  ON listings (provider_profile_id)
  WHERE status != 'archived';

-- =============================================================================
-- 4. EXCLUSIVE_LOCKS: Add expires_at for automatic cleanup
-- =============================================================================

ALTER TABLE exclusive_locks ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE exclusive_locks ADD COLUMN IF NOT EXISTS listing_id UUID REFERENCES listings(id);
ALTER TABLE exclusive_locks ADD COLUMN IF NOT EXISTS event_start TIMESTAMPTZ;
ALTER TABLE exclusive_locks ADD COLUMN IF NOT EXISTS event_end TIMESTAMPTZ;

-- =============================================================================
-- 5. PAYMENT_RECORDS: Add missing status to CHECK constraint
-- =============================================================================
-- Current: pending, processing, successful, failed, refunded, disputed

DO $$ BEGIN
  ALTER TABLE payment_records DROP CONSTRAINT IF EXISTS payment_records_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE payment_records ADD CONSTRAINT payment_records_status_check
  CHECK (status IN ('pending', 'processing', 'successful', 'failed', 'refunded', 'disputed'));

-- =============================================================================
-- 6. BOOKINGS: Add idempotency_key column
-- =============================================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

-- =============================================================================
-- 7. BOOKINGS: Add check-in token columns
-- =============================================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_in_token TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_in_token_expires_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

-- =============================================================================
-- 8. LISTINGS: Rename status values to match spec
-- =============================================================================
-- pending_review -> under_review (spec §47)

UPDATE listings SET status = 'under_review' WHERE status = 'pending_review';

DO $$ BEGIN
  ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE listings ADD CONSTRAINT listings_status_check
  CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'suspended', 'archived'));

-- Update any code references from pending_review to submitted
UPDATE listings SET status = 'submitted' WHERE status = 'pending_review';

-- =============================================================================
-- 9. FUNCTION: Atomic booking creation from soft hold
-- =============================================================================

CREATE OR REPLACE FUNCTION convert_hold_to_booking(
  p_hold_id UUID,
  p_guest_id UUID,
  p_host_id UUID,
  p_headcount INTEGER,
  p_total_amount_kobo INTEGER,
  p_pricing_snapshot JSONB,
  p_terms_snapshot JSONB,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_hold RECORD;
  v_booking_id UUID;
  v_result JSONB;
BEGIN
  -- Lock the soft hold row to prevent concurrent conversion
  SELECT id, slot_id, headcount, expires_at, booking_id, state
  INTO v_hold
  FROM soft_holds
  WHERE id = p_hold_id
  FOR UPDATE;

  -- Validate hold exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Hold not found');
  END IF;

  -- Validate hold is still active
  IF v_hold.state != 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Hold is no longer active');
  END IF;

  -- Validate hold hasn't expired
  IF v_hold.expires_at < now() THEN
    -- Mark as expired
    UPDATE soft_holds SET state = 'released', released_at = now() WHERE id = p_hold_id;
    RETURN jsonb_build_object('ok', false, 'error', 'Hold has expired');
  END IF;

  -- Validate headcount doesn't exceed hold
  IF p_headcount > v_hold.headcount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Headcount exceeds hold');
  END IF;

  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_booking_id
    FROM bookings
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'booking_id', v_booking_id, 'duplicate', true);
    END IF;
  END IF;

  -- Create the booking
  INSERT INTO bookings (
    guest_id, host_id, listing_id, booking_type, status,
    headcount, total_amount_kobo, pricing_snapshot, terms_snapshot,
    idempotency_key, expires_at, slot_id
  )
  SELECT
    p_guest_id,
    p_host_id,
    l.listing_id,
    'capacity',
    'awaiting_payment',
    p_headcount,
    p_total_amount_kobo,
    p_pricing_snapshot,
    p_terms_snapshot,
    p_idempotency_key,
    now() + INTERVAL '15 minutes',
    v_hold.slot_id
  FROM soft_holds h
  JOIN slots s ON s.id = h.slot_id
  JOIN listings l ON l.id = s.listing_id
  WHERE h.id = p_hold_id
  RETURNING id INTO v_booking_id;

  -- Mark hold as converted
  UPDATE soft_holds
  SET state = 'released', released_at = now(), booking_id = v_booking_id
  WHERE id = p_hold_id;

  -- Atomically increment booked count on slot
  UPDATE slots
  SET booked = booked + p_headcount
  WHERE id = v_hold.slot_id
    AND capacity >= booked + p_headcount;

  -- Check if the slot update succeeded (capacity check)
  IF NOT FOUND THEN
    -- Rollback: release the hold and delete the booking
    UPDATE soft_holds SET state = 'active', booking_id = NULL WHERE id = p_hold_id;
    DELETE FROM bookings WHERE id = v_booking_id;
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient capacity');
  END IF;

  -- Log the transition
  INSERT INTO booking_transitions (booking_id, from_status, to_status, triggered_by, reason)
  VALUES (v_booking_id, NULL, 'awaiting_payment', p_guest_id, 'Booking created from hold');

  RETURN jsonb_build_object('ok', true, 'booking_id', v_booking_id);
END;
$$;

-- =============================================================================
-- 10. FUNCTION: Atomic exclusive lock booking
-- =============================================================================

CREATE OR REPLACE FUNCTION create_exclusive_booking(
  p_listing_id UUID,
  p_guest_id UUID,
  p_host_id UUID,
  p_event_start TIMESTAMPTZ,
  p_event_end TIMESTAMPTZ,
  p_total_amount_kobo INTEGER,
  p_pricing_snapshot JSONB,
  p_terms_snapshot JSONB,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_lock RECORD;
  v_booking_id UUID;
  v_lock_id UUID;
BEGIN
  -- Check idempotency first
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_booking_id
    FROM bookings
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'booking_id', v_booking_id, 'duplicate', true);
    END IF;
  END IF;

  -- Check for conflicting exclusive bookings (atomic)
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE listing_id = p_listing_id
      AND status IN ('confirmed', 'awaiting_payment', 'payment_processing')
      AND booking_type = 'exclusive'
      AND tstzrange(start_date + COALESCE(start_time, '00:00'::time), end_date + COALESCE(end_time, '23:59'::time)) &&
          tstzrange(p_event_start, p_event_end)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Time slot already booked');
  END IF;

  -- Create the booking
  INSERT INTO bookings (
    guest_id, host_id, listing_id, booking_type, status,
    headcount, total_amount_kobo, pricing_snapshot, terms_snapshot,
    idempotency_key, start_date, end_date, start_time, end_time,
    expires_at
  ) VALUES (
    p_guest_id,
    p_host_id,
    p_listing_id,
    'exclusive',
    'awaiting_payment',
    1,
    p_total_amount_kobo,
    p_pricing_snapshot,
    p_terms_snapshot,
    p_idempotency_key,
    p_event_start::date,
    p_event_end::date,
    p_event_start::time,
    p_event_end::time,
    now() + INTERVAL '15 minutes'
  )
  RETURNING id INTO v_booking_id;

  -- Create the exclusive lock
  INSERT INTO exclusive_locks (listing_id, event_start, event_end, locked_by_booking_id, status, expires_at)
  VALUES (p_listing_id, p_event_start, p_event_end, v_booking_id, 'locked', now() + INTERVAL '15 minutes')
  RETURNING id INTO v_lock_id;

  -- Log the transition
  INSERT INTO booking_transitions (booking_id, from_status, to_status, triggered_by, reason)
  VALUES (v_booking_id, NULL, 'awaiting_payment', p_guest_id, 'Exclusive booking created');

  RETURN jsonb_build_object('ok', true, 'booking_id', v_booking_id, 'lock_id', v_lock_id);
END;
$$;

-- =============================================================================
-- 11. FUNCTION: Clean up expired holds and locks
-- =============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_holds_and_locks()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_released INTEGER;
BEGIN
  -- Release expired soft holds
  UPDATE soft_holds
  SET state = 'released', released_at = now()
  WHERE state = 'active'
    AND expires_at < now();

  GET DIAGNOSTICS v_released = ROW_COUNT;

  -- Release expired exclusive locks
  UPDATE exclusive_locks
  SET status = 'expired'
  WHERE status IN ('open', 'locked')
    AND expires_at IS NOT NULL
    AND expires_at < now();

  -- Cancel bookings that expired while awaiting payment
  UPDATE bookings
  SET status = 'expired', cancelled_at = now(), cancel_reason = 'Payment deadline expired'
  WHERE status = 'awaiting_payment'
    AND expires_at < now();

  RETURN v_released;
END;
$$;

-- =============================================================================
-- 12. Enable RLS on whatsapp_sessions (was missing)
-- =============================================================================

ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY whatsapp_sessions_admin_read ON whatsapp_sessions
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY whatsapp_sessions_service_insert ON whatsapp_sessions
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY whatsapp_sessions_service_update ON whatsapp_sessions
    FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
