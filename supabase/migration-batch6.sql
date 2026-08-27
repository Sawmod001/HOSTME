-- Migration: Batch 6 — Housing Engine
-- Adds property_owner role, tenancy periods, improved housing availability

BEGIN;

-- === 1. ADD property_owner TO provider_type ENUM ===
ALTER TYPE provider_type ADD VALUE IF NOT EXISTS 'property_owner';

-- === 2. CREATE tenancy_periods TABLE ===
-- Defines when a housing property is available for booking.
-- Hosts set "available windows" — guests can only book within these periods.
-- This replaces ad-hoc blocked_dates for long-term availability planning.
CREATE TABLE IF NOT EXISTS tenancy_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES users(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'booked', 'blocked', 'maintenance')),
  min_nights INTEGER NOT NULL DEFAULT 1 CHECK (min_nights >= 1),
  max_nights INTEGER CHECK (max_nights IS NULL OR max_nights >= 1),
  nightly_rate_override_kobo INTEGER CHECK (nightly_rate_override_kobo IS NULL OR nightly_rate_override_kobo >= 0),
  notes TEXT,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tenancy_periods_valid_dates CHECK (end_date > start_date),
  CONSTRAINT tenancy_periods_valid_nights CHECK (max_nights IS NULL OR max_nights >= min_nights)
);

-- Index for fast availability lookups
CREATE INDEX IF NOT EXISTS idx_tenancy_periods_listing_dates
  ON tenancy_periods (listing_id, start_date, end_date, status);

CREATE INDEX IF NOT EXISTS idx_tenancy_periods_host
  ON tenancy_periods (host_id);

-- Unique constraint: no overlapping available periods for same listing
-- (booked/blocked periods CAN overlap with available, but two "available" windows cannot overlap)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenancy_no_overlap_available
  ON tenancy_periods (listing_id, start_date, end_date)
  WHERE status = 'available';

-- === 3. RLS POLICIES FOR tenancy_periods ===
ALTER TABLE tenancy_periods ENABLE ROW LEVEL SECURITY;

-- Host can manage their own tenancy periods
CREATE POLICY tenancy_periods_host_manage ON tenancy_periods
  FOR ALL
  USING (
    host_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE l.id = tenancy_periods.listing_id
        AND pp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    host_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE l.id = tenancy_periods.listing_id
        AND pp.user_id = auth.uid()
    )
  );

-- Guests can read available periods for listings they're viewing
CREATE POLICY tenancy_periods_public_read ON tenancy_periods
  FOR SELECT
  USING (
    status = 'available'
    OR EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = tenancy_periods.booking_id
        AND b.guest_id = auth.uid()
    )
  );

-- Admin can read all
CREATE POLICY tenancy_periods_admin_read ON tenancy_periods
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- === 4. HELPER FUNCTION: check_housing_availability_with_tenancy ===
-- Enhanced availability check that considers tenancy periods.
-- If tenancy periods exist for the listing, the date range MUST fall within an available period.
-- If no tenancy periods exist, falls back to the basic blocked_dates check.
CREATE OR REPLACE FUNCTION check_housing_availability_with_tenancy(
  p_listing_id UUID,
  p_check_in DATE,
  p_check_out DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_has_tenancy BOOLEAN;
  v_in_tenancy BOOLEAN;
  v_blocked_count INTEGER;
BEGIN
  -- Check if listing has any tenancy periods
  SELECT EXISTS(
    SELECT 1 FROM tenancy_periods
    WHERE listing_id = p_listing_id
  ) INTO v_has_tenancy;

  -- If tenancy periods exist, check that the stay falls within an available window
  IF v_has_tenancy THEN
    SELECT EXISTS(
      SELECT 1 FROM tenancy_periods
      WHERE listing_id = p_listing_id
        AND status = 'available'
        AND start_date <= p_check_in
        AND end_date >= p_check_out
    ) INTO v_in_tenancy;

    IF NOT v_in_tenancy THEN
      RETURN jsonb_build_object(
        'available', false,
        'reason', 'no_available_tenancy_period',
        'detail', 'No available tenancy period covers the requested dates'
      );
    END IF;

    -- Also check blocked_dates within the tenancy window
    SELECT count(*) INTO v_blocked_count
    FROM blocked_dates
    WHERE listing_id = p_listing_id
      AND blocked_date >= p_check_in
      AND blocked_date < p_check_out;

    IF v_blocked_count > 0 THEN
      RETURN jsonb_build_object(
        'available', false,
        'reason', 'dates_blocked',
        'detail', v_blocked_count || ' date(s) are blocked within the tenancy period'
      );
    END IF;

    RETURN jsonb_build_object('available', true, 'reason', 'tenancy_period_ok');
  END IF;

  -- Fallback: basic blocked_dates check (no tenancy periods defined)
  RETURN check_housing_availability(p_listing_id, p_check_in, p_check_out);
END;
$$;

-- === 5. HELPER FUNCTION: create_tenancy_period ===
-- Atomically creates a tenancy period, checking for conflicts.
CREATE OR REPLACE FUNCTION create_tenancy_period(
  p_listing_id UUID,
  p_host_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_status TEXT DEFAULT 'available',
  p_min_nights INTEGER DEFAULT 1,
  p_max_nights INTEGER DEFAULT NULL,
  p_nightly_rate_override INTEGER DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_conflict_count INTEGER;
  v_period_id UUID;
BEGIN
  -- Validate host owns the listing
  IF NOT EXISTS(
    SELECT 1 FROM listings l
    JOIN provider_profiles pp ON pp.id = l.provider_profile_id
    WHERE l.id = p_listing_id AND pp.user_id = p_host_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You do not own this listing');
  END IF;

  -- Validate dates
  IF p_end_date <= p_start_date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'end_date must be after start_date');
  END IF;

  IF p_max_nights IS NOT NULL AND p_max_nights < p_min_nights THEN
    RETURN jsonb_build_object('ok', false, 'error', 'max_nights must be >= min_nights');
  END IF;

  -- Check for overlapping available periods (only for 'available' status)
  IF p_status = 'available' THEN
    SELECT count(*) INTO v_conflict_count
    FROM tenancy_periods
    WHERE listing_id = p_listing_id
      AND status = 'available'
      AND start_date < p_end_date
      AND end_date > p_start_date;

    IF v_conflict_count > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Overlaps with an existing available period');
    END IF;
  END IF;

  -- Check for overlapping bookings
  SELECT count(*) INTO v_conflict_count
  FROM bookings
  WHERE listing_id = p_listing_id
    AND status IN ('confirmed', 'awaiting_payment')
    AND event_start::date < p_end_date
    AND event_end::date > p_start_date;

  IF v_conflict_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Some dates have existing bookings');
  END IF;

  -- Create the period
  INSERT INTO tenancy_periods (
    listing_id, host_id, start_date, end_date, status,
    min_nights, max_nights, nightly_rate_override_kobo, notes
  ) VALUES (
    p_listing_id, p_host_id, p_start_date, p_end_date, p_status,
    p_min_nights, p_max_nights, p_nightly_rate_override, p_notes
  ) RETURNING id INTO v_period_id;

  RETURN jsonb_build_object(
    'ok', true,
    'period_id', v_period_id,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'status', p_status
  );
END;
$$;

-- === 6. UPDATED TRIGGER: Set updated_at on tenancy_periods ===
CREATE OR REPLACE FUNCTION update_tenancy_periods_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenancy_periods_updated_at ON tenancy_periods;
CREATE TRIGGER tenancy_periods_updated_at
  BEFORE UPDATE ON tenancy_periods
  FOR EACH ROW EXECUTE FUNCTION update_tenancy_periods_updated_at();

-- === 7. BOOKING TRIGGER: Auto-block dates on housing booking confirmation ===
-- When a housing booking is confirmed, auto-block the dates
CREATE OR REPLACE FUNCTION auto_block_dates_on_housing_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_d DATE;
BEGIN
  -- Only for housing bookings that transition to confirmed
  IF NEW.booking_type = 'housing' AND NEW.status = 'confirmed'
     AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN

    -- Block each night
    v_d := NEW.event_start::date;
    WHILE v_d < NEW.event_end::date LOOP
      INSERT INTO blocked_dates (listing_id, blocked_date, reason, booking_id)
      VALUES (NEW.listing_id, v_d, 'booking_confirmed', NEW.id)
      ON CONFLICT (listing_id, blocked_date) DO NOTHING;
      v_d := v_d + INTERVAL '1 day';
    END LOOP;

    -- Update tenancy period status if one covers these dates
    UPDATE tenancy_periods
    SET status = 'booked',
        booking_id = NEW.id,
        nightly_rate_override_kobo = (
          SELECT (NEW.pricing_snapshot->>'nightlyRate')::integer
          WHERE NEW.pricing_snapshot ? 'nightlyRate'
        )
    WHERE listing_id = NEW.listing_id
      AND status = 'available'
      AND start_date <= NEW.event_start::date
      AND end_date >= NEW.event_end::date;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_block_dates_trigger ON bookings;
CREATE TRIGGER auto_block_dates_trigger
  AFTER INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION auto_block_dates_on_housing_booking();

-- === 8. BOOKING TRIGGER: Auto-release dates on housing booking cancellation ===
CREATE OR REPLACE FUNCTION auto_release_dates_on_housing_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.booking_type = 'housing' AND NEW.status = 'cancelled'
     AND OLD.status != 'cancelled' THEN

    -- Remove blocked dates for this booking
    DELETE FROM blocked_dates
    WHERE listing_id = NEW.listing_id
      AND booking_id = NEW.id
      AND reason IN ('booking_held', 'booking_confirmed');

    -- Restore tenancy period to available
    UPDATE tenancy_periods
    SET status = 'available',
        booking_id = NULL
    WHERE listing_id = NEW.listing_id
      AND booking_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_release_dates_trigger ON bookings;
CREATE TRIGGER auto_release_dates_trigger
  AFTER UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION auto_release_dates_on_housing_booking();

-- === 9. INDEXES for performance ===
CREATE INDEX IF NOT EXISTS idx_blocked_dates_listing_date
  ON blocked_dates (listing_id, blocked_date);

CREATE INDEX IF NOT EXISTS idx_blocked_dates_booking
  ON blocked_dates (booking_id)
  WHERE booking_id IS NOT NULL;

COMMIT;
