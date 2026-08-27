-- Migration: Batch 9 — Price Snapshot + Terms Snapshot
-- Immutability, indexing, and dispute evidence

BEGIN;

-- === 1. IMMUTABILITY TRIGGER ===
-- Once a booking is confirmed/paid, pricing_snapshot and terms_snapshot cannot be changed.
-- This ensures the guest and host always have a record of what was agreed.
CREATE OR REPLACE FUNCTION prevent_snapshot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow inserts (new bookings)
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- For updates: block changes to snapshots once booking is past awaiting_payment
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('confirmed', 'completed', 'cancelled') THEN
      -- Pricing snapshot is fully immutable after confirmation
      IF NEW.pricing_snapshot IS DISTINCT FROM OLD.pricing_snapshot THEN
        RAISE EXCEPTION 'pricing_snapshot is immutable once booking is confirmed';
      END IF;

      -- Terms snapshot is immutable after confirmation (except hostNotes/checkInTime/checkOutTime)
      -- We allow term updates that don't affect pricing or core terms
      IF NEW.terms_snapshot ? 'checkInTime'
         AND (NEW.terms_snapshot->>'checkInTime') IS DISTINCT FROM (OLD.terms_snapshot->>'checkInTime') THEN
        -- Allow checkInTime updates (host flexibility)
        NULL;
      ELSIF NEW.terms_snapshot ? 'checkOutTime'
         AND (NEW.terms_snapshot->>'checkOutTime') IS DISTINCT FROM (OLD.terms_snapshot->>'checkOutTime') THEN
        -- Allow checkOutTime updates (host flexibility)
        NULL;
      ELSIF NEW.terms_snapshot ? 'hostNotes'
         AND (NEW.terms_snapshot->>'hostNotes') IS DISTINCT FROM (OLD.terms_snapshot->>'hostNotes') THEN
        -- Allow hostNotes updates
        NULL;
      ELSIF NEW.terms_snapshot IS DISTINCT FROM OLD.terms_snapshot THEN
        RAISE EXCEPTION 'terms_snapshot is immutable once booking is confirmed (except checkInTime/checkOutTime/hostNotes)';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_snapshot_mutation_trigger ON bookings;
CREATE TRIGGER prevent_snapshot_mutation_trigger
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION prevent_snapshot_mutation();

-- === 2. INDEXES for snapshot queries ===
CREATE INDEX IF NOT EXISTS idx_bookings_pricing_snapshot
  ON bookings USING gin (pricing_snapshot)
  WHERE pricing_snapshot IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_terms_snapshot
  ON bookings USING gin (terms_snapshot)
  WHERE terms_snapshot IS NOT NULL;

-- === 3. BOOKING_SNAPSHOT_AUDIT TABLE ===
-- Immutable audit trail of every snapshot change (before immutability kicks in)
CREATE TABLE IF NOT EXISTS booking_snapshot_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('pricing', 'terms', 'both')),
  old_pricing_snapshot JSONB,
  new_pricing_snapshot JSONB,
  old_terms_snapshot JSONB,
  new_terms_snapshot JSONB,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_snapshot_audit_booking
  ON booking_snapshot_audit (booking_id, changed_at);

-- === 4. RLS for snapshot audit ===
ALTER TABLE booking_snapshot_audit ENABLE ROW LEVEL SECURITY;

-- Guests can see audits for their bookings
CREATE POLICY snapshot_audit_guest_read ON booking_snapshot_audit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = booking_snapshot_audit.booking_id
        AND b.guest_id = auth.uid()
    )
  );

-- Hosts can see audits for their listings' bookings
CREATE POLICY snapshot_audit_host_read ON booking_snapshot_audit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN listings l ON l.id = b.listing_id
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE b.id = booking_snapshot_audit.booking_id
        AND pp.user_id = auth.uid()
    )
  );

-- Admin can see all
CREATE POLICY snapshot_audit_admin_read ON booking_snapshot_audit
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- === 5. HELPER FUNCTION: get_booking_price_breakdown ===
-- Returns a human-readable price breakdown from the snapshot
CREATE OR REPLACE FUNCTION get_booking_price_breakdown(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_booking RECORD;
  v_snapshot JSONB;
  v_breakdown JSONB;
BEGIN
  SELECT pricing_snapshot, booking_type, total_amount_kobo, commission_kobo
  INTO v_booking
  FROM bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Booking not found');
  END IF;

  v_snapshot := v_booking.pricing_snapshot;

  IF v_snapshot IS NULL THEN
    RETURN jsonb_build_object(
      'booking_type', v_booking.booking_type,
      'total_amount_kobo', v_booking.total_amount_kobo,
      'commission_kobo', v_booking.commission_kobo,
      'note', 'No pricing snapshot available'
    );
  END IF;

  -- Build breakdown based on booking type
  IF v_booking.booking_type = 'capacity' THEN
    v_breakdown := jsonb_build_object(
      'booking_type', 'capacity',
      'base_rate_per_hour', v_snapshot->>'baseRatePerHour',
      'headcount', v_snapshot->>'headcount',
      'hours', v_snapshot->>'hours',
      'base_total', v_snapshot->>'baseTotal',
      'add_ons_total', v_snapshot->>'addOnTotal',
      'service_fee', v_snapshot->>'serviceFee',
      'total', v_booking.total_amount_kobo,
      'commission', v_booking.commission_kobo
    );
  ELSIF v_booking.booking_type = 'exclusive' THEN
    v_breakdown := jsonb_build_object(
      'booking_type', 'exclusive',
      'base_rate_per_hour', v_snapshot->>'baseRatePerHour',
      'hours', v_snapshot->>'hours',
      'base_total', v_snapshot->>'baseTotal',
      'service_fee', v_snapshot->>'serviceFee',
      'total', v_booking.total_amount_kobo,
      'commission', v_booking.commission_kobo
    );
  ELSIF v_booking.booking_type = 'housing' THEN
    v_breakdown := jsonb_build_object(
      'booking_type', 'housing',
      'nightly_rate', v_snapshot->>'nightlyRate',
      'original_nightly_rate', v_snapshot->>'originalNightlyRate',
      'nights', v_snapshot->>'nights',
      'nightly_total', v_snapshot->>'nightlyTotal',
      'weekly_discount', v_snapshot->>'weeklyDiscount',
      'cleaning_fee', v_snapshot->>'cleaningFee',
      'service_fee', v_snapshot->>'serviceFee',
      'total', v_booking.total_amount_kobo,
      'commission', v_booking.commission_kobo,
      'tenancy_override', v_snapshot->>'tenancyOverride'
    );
  ELSE
    v_breakdown := jsonb_build_object(
      'booking_type', v_booking.booking_type,
      'total', v_booking.total_amount_kobo,
      'commission', v_booking.commission_kobo
    );
  END IF;

  RETURN v_breakdown;
END;
$$;

COMMIT;
