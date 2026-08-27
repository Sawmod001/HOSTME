-- =============================================================================
-- ClockHost Migration — Batch 5: Unified Availability + Reservation
-- =============================================================================

BEGIN;

-- =============================================================================
-- ADD PRICING SNAPSHOT TO BOOKINGS
-- Store what the guest agreed to at booking time (immutable after creation)
-- =============================================================================

DO $$ BEGIN
  ALTER TABLE bookings ADD COLUMN pricing_snapshot JSONB DEFAULT NULL;
  ALTER TABLE bookings ADD COLUMN terms_snapshot JSONB DEFAULT NULL;
  ALTER TABLE bookings ADD COLUMN confirmed_at TIMESTAMPTZ;
  ALTER TABLE bookings ADD COLUMN expires_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- =============================================================================
-- ADD HOLD STATE TO SOFT_HOLDS
-- Track the lifecycle: active → expired → converted / released
-- =============================================================================

DO $$ BEGIN
  ALTER TABLE soft_holds ADD COLUMN state TEXT NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'expired', 'converted', 'released'));
  ALTER TABLE soft_holds ADD COLUMN released_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- =============================================================================
-- HOLD CLEANUP FUNCTION: Expire stale holds and release slot capacity
-- =============================================================================

CREATE OR REPLACE FUNCTION expire_and_release_holds()
RETURNS TABLE (expired INTEGER, released INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_expired INTEGER := 0;
  v_released INTEGER := 0;
  v_hold RECORD;
BEGIN
  FOR v_hold IN
    SELECT sh.id, sh.slot_id, sh.headcount
    FROM soft_holds sh
    WHERE sh.state = 'active'
      AND sh.expires_at <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Mark as expired
    UPDATE soft_holds SET state = 'expired', released_at = now()
    WHERE id = v_hold.id;

    -- Release capacity if no booking was created
    UPDATE slots SET booked = GREATEST(booked - v_hold.headcount, 0)
    WHERE id = v_hold.slot_id;

    v_expired := v_expired + 1;
    v_released := v_released + 1;
  END LOOP;

  RETURN QUERY SELECT v_expired, v_released;
END;
$$;

-- =============================================================================
-- UNIFIED AVAILABILITY CHECK: Check if a time range is available
-- Works for both capacity (slots) and exclusive (locks) booking types
-- =============================================================================

CREATE OR REPLACE FUNCTION check_time_availability(
  p_listing_id UUID,
  p_event_start TIMESTAMPTZ,
  p_event_end TIMESTAMPTZ
)
RETURNS TABLE (
  available BOOLEAN,
  reason TEXT,
  existing_booking_id UUID
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_booking_conflict RECORD;
  v_blocked_conflict RECORD;
  v_listing RECORD;
BEGIN
  -- Check listing exists and is active
  SELECT * INTO v_listing FROM listings WHERE id = p_listing_id AND status = 'active';
  IF v_listing.id IS NULL THEN
    RETURN QUERY SELECT false, 'listing_not_active'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Check blocked_dates
  SELECT bd.blocked_date INTO v_blocked_conflict
  FROM blocked_dates bd
  WHERE bd.listing_id = p_listing_id
    AND bd.blocked_date >= p_event_start::DATE
    AND bd.blocked_date < p_event_end::DATE
  LIMIT 1;

  IF v_blocked_conflict.blocked_date IS NOT NULL THEN
    RETURN QUERY SELECT false, 'date_blocked'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Check overlapping confirmed/awaiting_payment bookings
  SELECT b.id INTO v_booking_conflict
  FROM bookings b
  WHERE b.listing_id = p_listing_id
    AND b.status IN ('confirmed', 'awaiting_payment')
    AND b.event_start < p_event_end
    AND b.event_end > p_event_start
  LIMIT 1;

  IF v_booking_conflict.id IS NOT NULL THEN
    RETURN QUERY SELECT false, 'time_slot_booked'::TEXT, v_booking_conflict.id;
    RETURN;
  END IF;

  -- For exclusive bookings, check exclusive_locks
  IF v_listing.booking_type = 'exclusive' THEN
    SELECT el.id INTO v_booking_conflict
    FROM exclusive_locks el
    WHERE el.listing_id = p_listing_id
      AND el.status = 'locked'
      AND el.event_start < p_event_end
      AND el.event_end > p_event_start
    LIMIT 1;

    IF v_booking_conflict.id IS NOT NULL THEN
      RETURN QUERY SELECT false, 'exclusive_slot_locked'::TEXT, NULL::UUID;
      RETURN;
    END IF;
  END IF;

  -- Available
  RETURN QUERY SELECT true, 'available'::TEXT, NULL::UUID;
END;
$$;

-- =============================================================================
-- HOLD CREATION: Atomic hold with capacity check
-- =============================================================================

CREATE OR REPLACE FUNCTION create_hold(
  p_listing_id UUID,
  p_slot_id UUID,
  p_guest_id UUID,
  p_headcount INTEGER,
  p_expires_in_minutes INTEGER DEFAULT 10
)
RETURNS TABLE (
  hold_id UUID,
  expires_at TIMESTAMPTZ,
  ok BOOLEAN,
  error TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_slot RECORD;
  v_hold_id UUID;
  v_expires TIMESTAMPTZ;
BEGIN
  -- Lock the slot row
  SELECT * INTO v_slot
  FROM slots
  WHERE id = p_slot_id AND listing_id = p_listing_id
  FOR UPDATE;

  IF v_slot.id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TIMESTAMPTZ, false, 'slot_not_found'::TEXT;
    RETURN;
  END IF;

  -- Check capacity
  IF v_slot.booked + p_headcount > v_slot.capacity THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TIMESTAMPTZ, false, 'insufficient_capacity'::TEXT;
    RETURN;
  END IF;

  -- Increment booked count
  UPDATE slots SET booked = booked + p_headcount WHERE id = p_slot_id;

  -- Create the hold
  v_expires := now() + (p_expires_in_minutes || ' minutes')::INTERVAL;
  INSERT INTO soft_holds (slot_id, headcount, expires_at, guest_id, booking_id, state)
  VALUES (p_slot_id, p_headcount, v_expires, p_guest_id, NULL, 'active')
  RETURNING id INTO v_hold_id;

  RETURN QUERY SELECT v_hold_id, v_expires, true, NULL::TEXT;
END;
$$;

-- =============================================================================
-- HOLD CONVERSION: Convert a hold to a booking (atomic)
-- =============================================================================

CREATE OR REPLACE FUNCTION convert_hold_to_booking(
  p_hold_id UUID,
  p_guest_id UUID,
  p_booking_data JSONB
)
RETURNS TABLE (
  booking_id UUID,
  ok BOOLEAN,
  error TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_hold RECORD;
  v_booking_id UUID;
BEGIN
  -- Lock the hold
  SELECT * INTO v_hold
  FROM soft_holds
  WHERE id = p_hold_id AND state = 'active'
  FOR UPDATE;

  IF v_hold.id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, false, 'hold_not_found_or_expired'::TEXT;
    RETURN;
  END IF;

  -- Check not expired
  IF v_hold.expires_at <= now() THEN
    UPDATE soft_holds SET state = 'expired', released_at = now() WHERE id = p_hold_id;
    -- Release capacity
    UPDATE slots SET booked = GREATEST(booked - v_hold.headcount, 0) WHERE id = v_hold.slot_id;
    RETURN QUERY SELECT NULL::UUID, false, 'hold_expired'::TEXT;
    RETURN;
  END IF;

  -- Check guest ownership
  IF v_hold.guest_id IS DISTINCT FROM p_guest_id THEN
    RETURN QUERY SELECT NULL::UUID, false, 'hold_does_not_belong_to_you'::TEXT;
    RETURN;
  END IF;

  -- Create the booking
  INSERT INTO bookings (
    listing_id, guest_id, booking_type, event_start, event_end,
    headcount, status, total_amount_kobo, commission_kobo,
    pricing_snapshot, terms_snapshot, expires_at
  ) VALUES (
    (p_booking_data->>'listing_id')::UUID,
    p_guest_id,
    p_booking_data->>'booking_type',
    (p_booking_data->>'event_start')::TIMESTAMPTZ,
    (p_booking_data->>'event_end')::TIMESTAMPTZ,
    v_hold.headcount,
    'awaiting_payment',
    (p_booking_data->>'total_amount_kobo')::INTEGER,
    (p_booking_data->>'commission_kobo')::INTEGER,
    p_booking_data->'pricing_snapshot',
    p_booking_data->'terms_snapshot',
    now() + interval '15 minutes'
  )
  RETURNING id INTO v_booking_id;

  -- Mark hold as converted
  UPDATE soft_holds
  SET state = 'converted', booking_id = v_booking_id, released_at = now()
  WHERE id = p_hold_id;

  RETURN QUERY SELECT v_booking_id, true, NULL::TEXT;
END;
$$;

COMMIT;
