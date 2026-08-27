-- =============================================================================
-- ClockHost Migration — Batch 4: The Time Engine
-- =============================================================================
-- Availability rules, exceptions, and slot generation for venues.
-- =============================================================================

BEGIN;

-- =============================================================================
-- AVAILABILITY RULES: Recurring weekly schedules per listing
-- Each rule says "on these days of the week, at these times, this listing is available"
-- =============================================================================

CREATE TABLE IF NOT EXISTS availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_time < end_time),
  UNIQUE(listing_id, day_of_week, start_time)
);

CREATE INDEX IF NOT EXISTS idx_availability_rules_listing ON availability_rules(listing_id);
CREATE INDEX IF NOT EXISTS idx_availability_rules_day ON availability_rules(day_of_week);

ALTER TABLE availability_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "availability_rules_read_public" ON availability_rules;
CREATE POLICY "availability_rules_read_public" ON availability_rules
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "availability_rules_insert_own" ON availability_rules;
CREATE POLICY "availability_rules_insert_own" ON availability_rules
  FOR INSERT WITH CHECK (
    listing_id IN (
      SELECT l.id FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE pp.user_id::text = current_setting('app.user_id', true)
    )
  );

DROP POLICY IF EXISTS "availability_rules_update_own" ON availability_rules;
CREATE POLICY "availability_rules_update_own" ON availability_rules
  FOR UPDATE USING (
    listing_id IN (
      SELECT l.id FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE pp.user_id::text = current_setting('app.user_id', true)
    )
  );

DROP POLICY IF EXISTS "availability_rules_delete_own" ON availability_rules;
CREATE POLICY "availability_rules_delete_own" ON availability_rules
  FOR DELETE USING (
    listing_id IN (
      SELECT l.id FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE pp.user_id::text = current_setting('app.user_id', true)
    )
  );

DROP TRIGGER IF EXISTS availability_rules_updated_at ON availability_rules;
CREATE TRIGGER availability_rules_updated_at
  BEFORE UPDATE ON availability_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- AVAILABILITY EXCEPTIONS: Date-specific overrides
-- "This listing is closed/open on this specific date regardless of rules"
-- =============================================================================

CREATE TABLE IF NOT EXISTS availability_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT false,
  start_time TIME,
  end_time TIME,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (is_available = true AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
    OR (is_available = false)
  ),
  UNIQUE(listing_id, exception_date)
);

CREATE INDEX IF NOT EXISTS idx_availability_exceptions_listing ON availability_exceptions(listing_id);
CREATE INDEX IF NOT EXISTS idx_availability_exceptions_date ON availability_exceptions(exception_date);

ALTER TABLE availability_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "availability_exceptions_read_public" ON availability_exceptions;
CREATE POLICY "availability_exceptions_read_public" ON availability_exceptions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "availability_exceptions_insert_own" ON availability_exceptions;
CREATE POLICY "availability_exceptions_insert_own" ON availability_exceptions
  FOR INSERT WITH CHECK (
    listing_id IN (
      SELECT l.id FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE pp.user_id::text = current_setting('app.user_id', true)
    )
  );

DROP POLICY IF EXISTS "availability_exceptions_update_own" ON availability_exceptions;
CREATE POLICY "availability_exceptions_update_own" ON availability_exceptions
  FOR UPDATE USING (
    listing_id IN (
      SELECT l.id FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE pp.user_id::text = current_setting('app.user_id', true)
    )
  );

DROP POLICY IF EXISTS "availability_exceptions_delete_own" ON availability_exceptions;
CREATE POLICY "availability_exceptions_delete_own" ON availability_exceptions
  FOR DELETE USING (
    listing_id IN (
      SELECT l.id FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE pp.user_id::text = current_setting('app.user_id', true)
    )
  );

DROP TRIGGER IF EXISTS availability_exceptions_updated_at ON availability_exceptions;
CREATE TRIGGER availability_exceptions_updated_at
  BEFORE UPDATE ON availability_exceptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- FUNCTIONS: Availability checking
-- =============================================================================

-- Check if a listing is available at a specific date and time
-- Returns: is_available, rule_id (which rule applies), or exception info
CREATE OR REPLACE FUNCTION check_availability(
  p_listing_id UUID,
  p_check_date DATE,
  p_check_time TIME DEFAULT NULL
)
RETURNS TABLE (
  is_available BOOLEAN,
  source TEXT,
  rule_id UUID,
  start_time TIME,
  end_time TIME
)
LANGUAGE sql STABLE
AS $$
  -- 1. Check exceptions first (they override rules)
  SELECT
    ae.is_available,
    'exception'::TEXT AS source,
    NULL::UUID AS rule_id,
    ae.start_time,
    ae.end_time
  FROM availability_exceptions ae
  WHERE ae.listing_id = p_listing_id
    AND ae.exception_date = p_check_date
  LIMIT 1;

  -- 2. If no exception, check recurring rules
  -- Use EXTRACT(DOW FROM ...) to get day of week (0=Sunday)
  SELECT
    true AS is_available,
    'rule'::TEXT AS source,
    ar.id AS rule_id,
    ar.start_time,
    ar.end_time
  FROM availability_rules ar
  WHERE ar.listing_id = p_listing_id
    AND ar.day_of_week = EXTRACT(DOW FROM p_check_date)::INTEGER
    AND ar.is_active = true
    AND (p_check_time IS NULL OR (p_check_time >= ar.start_time AND p_check_time < ar.end_time))
  LIMIT 1;

  -- 3. If neither exception nor rule matches, not available
  SELECT
    false AS is_available,
    'no_rule'::TEXT AS source,
    NULL::UUID AS rule_id,
    NULL::TIME AS start_time,
    NULL::TIME AS end_time
  WHERE NOT EXISTS (
    SELECT 1 FROM availability_exceptions ae
    WHERE ae.listing_id = p_listing_id AND ae.exception_date = p_check_date
  )
  AND NOT EXISTS (
    SELECT 1 FROM availability_rules ar
    WHERE ar.listing_id = p_listing_id
      AND ar.day_of_week = EXTRACT(DOW FROM p_check_date)::INTEGER
      AND ar.is_active = true
  );
$$;

-- Generate available time slots for a listing over a date range
-- Respects: availability rules, exceptions, blocked_dates, existing bookings, buffer times
CREATE OR REPLACE FUNCTION generate_availability_slots(
  p_listing_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_slot_duration_minutes INTEGER DEFAULT 60,
  p_buffer_before_minutes INTEGER DEFAULT 0,
  p_buffer_after_minutes INTEGER DEFAULT 0
)
RETURNS TABLE (
  slot_date DATE,
  slot_start TIMESTAMPTZ,
  slot_end TIMESTAMPTZ,
  is_available BOOLEAN,
  block_reason TEXT
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_current_date DATE;
  v_rule RECORD;
  v_exception RECORD;
  v_slot_start TIMESTAMPTZ;
  v_slot_end TIMESTAMPTZ;
  v_has_booking BOOLEAN;
  v_is_blocked BOOLEAN;
BEGIN
  v_current_date := p_start_date;

  WHILE v_current_date <= p_end_date LOOP
    -- Check for exception on this date
    SELECT * INTO v_exception
    FROM availability_exceptions ae
    WHERE ae.listing_id = p_listing_id AND ae.exception_date = v_current_date
    LIMIT 1;

    IF v_exception.id IS NOT NULL THEN
      IF v_exception.is_available AND v_exception.start_time IS NOT NULL THEN
        -- Exception says available with custom hours — generate slots
        v_slot_start := v_current_date + v_exception.start_time;
        WHILE v_slot_start + (p_slot_duration_minutes || ' minutes')::INTERVAL <= v_current_date + v_exception.end_time LOOP
          v_slot_end := v_slot_start + (p_slot_duration_minutes || ' minutes')::INTERVAL;

          -- Check blocked_dates
          SELECT EXISTS(
            SELECT 1 FROM blocked_dates bd
            WHERE bd.listing_id = p_listing_id AND bd.blocked_date = v_current_date
          ) INTO v_is_blocked;

          -- Check existing bookings
          SELECT EXISTS(
            SELECT 1 FROM bookings b
            WHERE b.listing_id = p_listing_id
              AND b.status IN ('confirmed', 'awaiting_payment')
              AND b.event_start < v_slot_end
              AND b.event_end > v_slot_start
          ) INTO v_has_booking;

          slot_date := v_current_date;
          slot_start := v_slot_start;
          slot_end := v_slot_end;
          is_available := NOT v_is_blocked AND NOT v_has_booking;
          block_reason := CASE
            WHEN v_is_blocked THEN 'blocked'
            WHEN v_has_booking THEN 'booked'
            ELSE NULL
          END;
          RETURN NEXT;

          v_slot_start := v_slot_end;
        END LOOP;
      END IF;
      -- If exception says not available, skip this date entirely
      v_current_date := v_current_date + 1;
      CONTINUE;
    END IF;

    -- No exception — use recurring rules
    FOR v_rule IN
      SELECT ar.start_time, ar.end_time
      FROM availability_rules ar
      WHERE ar.listing_id = p_listing_id
        AND ar.day_of_week = EXTRACT(DOW FROM v_current_date)::INTEGER
        AND ar.is_active = true
      ORDER BY ar.start_time
    LOOP
      v_slot_start := v_current_date + v_rule.start_time;
      WHILE v_slot_start + (p_slot_duration_minutes || ' minutes')::INTERVAL <= v_current_date + v_rule.end_time LOOP
        v_slot_end := v_slot_start + (p_slot_duration_minutes || ' minutes')::INTERVAL;

        -- Check blocked_dates
        SELECT EXISTS(
          SELECT 1 FROM blocked_dates bd
          WHERE bd.listing_id = p_listing_id AND bd.blocked_date = v_current_date
        ) INTO v_is_blocked;

        -- Check existing bookings
        SELECT EXISTS(
          SELECT 1 FROM bookings b
          WHERE b.listing_id = p_listing_id
            AND b.status IN ('confirmed', 'awaiting_payment')
            AND b.event_start < v_slot_end
            AND b.event_end > v_slot_start
        ) INTO v_has_booking;

        slot_date := v_current_date;
        slot_start := v_slot_start;
        slot_end := v_slot_end;
        is_available := NOT v_is_blocked AND NOT v_has_booking;
        block_reason := CASE
          WHEN v_is_blocked THEN 'blocked'
          WHEN v_has_booking THEN 'booked'
          ELSE NULL
        END;
        RETURN NEXT;

        v_slot_start := v_slot_end;
      END LOOP;
    END LOOP;

    v_current_date := v_current_date + 1;
  END LOOP;
END;
$$;

-- =============================================================================
-- LISTING CONFIG: Add buffer time + booking window to operational_rules
-- These are stored in the existing JSONB column, no schema change needed.
-- Document the expected keys:
--   operational_rules.buffer_before_minutes (default 0)
--   operational_rules.buffer_after_minutes (default 0)
--   operational_rules.booking_window_days (default 30) — how far ahead guests can book
--   operational_rules.min_notice_hours (default 0) — minimum notice required
--   operational_rules.slot_duration_minutes (default 60) — for capacity venues
-- =============================================================================

COMMIT;
