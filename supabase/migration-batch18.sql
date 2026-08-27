-- Migration: Batch 18 — Availability Calendar
-- iCal export/import, bulk management, calendar subscriptions

BEGIN;

-- === 1. CREATE calendar_subscriptions TABLE ===
-- Stores external calendar URLs to sync blocked dates from
CREATE TABLE IF NOT EXISTS calendar_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES users(id),
  calendar_url TEXT NOT NULL,
  calendar_name TEXT,
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT NOT NULL DEFAULT 'active'
    CHECK (sync_status IN ('active', 'paused', 'error')),
  sync_error TEXT,
  import_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cal_subscriptions_listing ON calendar_subscriptions (listing_id);
CREATE INDEX IF NOT EXISTS idx_cal_subscriptions_host ON calendar_subscriptions (host_id);

-- === 2. RLS FOR calendar_subscriptions ===
ALTER TABLE calendar_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY cal_subscriptions_host_manage ON calendar_subscriptions
  FOR ALL
  USING (
    host_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE l.id = calendar_subscriptions.listing_id
        AND pp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    host_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE l.id = calendar_subscriptions.listing_id
        AND pp.user_id = auth.uid()
    )
  );

-- === 3. iCal EXPORT FUNCTION ===
-- Generates iCal format for a listing's blocked dates
CREATE OR REPLACE FUNCTION export_listing_ical(p_listing_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_listing RECORD;
  v_line RECORD;
  v_ical TEXT;
BEGIN
  SELECT id, title, location INTO v_listing
  FROM listings WHERE id = p_listing_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Build iCal header
  v_ical := 'BEGIN:VCALENDAR' || E'\r\n'
    || 'VERSION:2.0' || E'\r\n'
    || 'PRODID:-//ClockHost//Calendar//EN' || E'\r\n'
    || 'CALSCALE:GREGORIAN' || E'\r\n'
    || 'METHOD:PUBLISH' || E'\r\n'
    || 'X-WR-CALNAME:' || COALESCE(v_listing.title, 'ClockHost Listing') || E'\r\n'
    || 'X-WR-TIMEZONE: Africa/Lagos' || E'\r\n';

  -- Add each blocked date as an all-day VEVENT
  FOR v_line IN
    SELECT blocked_date, reason, booking_id
    FROM blocked_dates
    WHERE listing_id = p_listing_id
    ORDER BY blocked_date
  LOOP
    v_ical := v_ical
      || 'BEGIN:VEVENT' || E'\r\n'
      || 'DTSTART;VALUE=DATE:' || to_char(v_line.blocked_date, 'YYYYMMDD') || E'\r\n'
      || 'DTEND;VALUE=DATE:' || to_char(v_line.blocked_date + INTERVAL '1 day', 'YYYYMMDD') || E'\r\n'
      || 'SUMMARY:' || CASE
          WHEN v_line.reason = 'host_blocked' THEN 'Blocked'
          WHEN v_line.booking_id IS NOT NULL THEN 'Booked'
          ELSE 'Unavailable'
        END || E'\r\n'
      || 'DESCRIPTION:Reason: ' || COALESCE(v_line.reason, 'blocked') || E'\r\n'
      || 'UID:' || v_line.blocked_date::text || '-' || p_listing_id || '@clockhost' || E'\r\n'
      || 'TRANSP:TRANSPARENT' || E'\r\n'
      || 'END:VEVENT' || E'\r\n';
  END LOOP;

  v_ical := v_ical || 'END:VCALENDAR' || E'\r\n';

  RETURN v_ical;
END;
$$;

-- === 4. BULK BLOCK DATES FUNCTION ===
-- Block a date range (start to end) with optional reason
CREATE OR REPLACE FUNCTION bulk_block_dates(
  p_listing_id UUID,
  p_host_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_reason TEXT DEFAULT 'host_blocked'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_d DATE;
  v_blocked_count INTEGER := 0;
  v_skipped_count INTEGER := 0;
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
  IF p_end_date < p_start_date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'end_date must be after start_date');
  END IF;

  -- Check range is not too large (max 365 days)
  IF (p_end_date - p_start_date) > 365 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot block more than 365 days at once');
  END IF;

  v_d := p_start_date;
  WHILE v_d <= p_end_date LOOP
    -- Skip if already blocked
    IF EXISTS(
      SELECT 1 FROM blocked_dates
      WHERE listing_id = p_listing_id AND blocked_date = v_d
    ) THEN
      v_skipped_count := v_skipped_count + 1;
    ELSE
      -- Skip if has booking
      IF EXISTS(
        SELECT 1 FROM bookings
        WHERE listing_id = p_listing_id
          AND status IN ('confirmed', 'awaiting_payment')
          AND v_d >= event_start::date
          AND v_d < event_end::date
      ) THEN
        v_skipped_count := v_skipped_count + 1;
      ELSE
        INSERT INTO blocked_dates (listing_id, blocked_date, reason)
        VALUES (p_listing_id, v_d, p_reason);
        v_blocked_count := v_blocked_count + 1;
      END IF;
    END IF;

    v_d := v_d + INTERVAL '1 day';
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'blocked', v_blocked_count,
    'skipped', v_skipped_count,
    'total_dates', (p_end_date - p_start_date + 1)::integer
  );
END;
$$;

-- === 5. BULK UNBLOCK DATES FUNCTION ===
CREATE OR REPLACE FUNCTION bulk_unblock_dates(
  p_listing_id UUID,
  p_host_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_unblocked_count INTEGER;
BEGIN
  -- Validate host owns the listing
  IF NOT EXISTS(
    SELECT 1 FROM listings l
    JOIN provider_profiles pp ON pp.id = l.provider_profile_id
    WHERE l.id = p_listing_id AND pp.user_id = p_host_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You do not own this listing');
  END IF;

  -- Only unblock host-blocked dates (not booking-held)
  DELETE FROM blocked_dates
  WHERE listing_id = p_listing_id
    AND blocked_date BETWEEN p_start_date AND p_end_date
    AND reason = 'host_blocked'
    AND booking_id IS NULL;

  GET DIAGNOSTICS v_unblocked_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'unblocked', v_unblocked_count
  );
END;
$$;

-- === 6. TRIGGER for calendar_subscriptions updated_at ===
CREATE OR REPLACE FUNCTION update_calendar_subscriptions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calendar_subscriptions_updated_at ON calendar_subscriptions;
CREATE TRIGGER calendar_subscriptions_updated_at
  BEFORE UPDATE ON calendar_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_calendar_subscriptions_updated_at();

COMMIT;
