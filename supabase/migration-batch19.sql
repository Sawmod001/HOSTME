-- Migration: Batch 19 — Export
-- Export tracking, scheduled exports

BEGIN;

-- === 1. CREATE export_jobs TABLE ===
-- Tracks data export requests
CREATE TABLE IF NOT EXISTS export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  export_type TEXT NOT NULL
    CHECK (export_type IN ('bookings', 'listings', 'revenue', 'users', 'reviews')),
  format TEXT NOT NULL DEFAULT 'csv'
    CHECK (format IN ('csv', 'json')),
  filters JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_url TEXT,
  record_count INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_user ON export_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_export_jobs_status ON export_jobs (status);

-- === 2. RLS FOR export_jobs ===
ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY export_jobs_own_read ON export_jobs
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY export_jobs_insert ON export_jobs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- === 3. EXPORT BOOKINGS FUNCTION ===
CREATE OR REPLACE FUNCTION export_bookings_csv(
  p_user_id UUID,
  p_role TEXT,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_csv TEXT;
  v_rec RECORD;
BEGIN
  -- Header row
  v_csv := 'booking_id,listing_title,guest_name,event_start,event_end,status,booking_type,total_kobo,commission_kobo,paid_at' || E'\r\n';

  FOR v_rec IN
    SELECT
      b.id,
      l.title as listing_title,
      COALESCE(u.full_name, 'Unknown') as guest_name,
      b.event_start,
      b.event_end,
      b.status,
      b.booking_type,
      b.total_amount_kobo,
      b.commission_kobo,
      b.paid_at
    FROM bookings b
    JOIN listings l ON l.id = b.listing_id
    LEFT JOIN users u ON u.id = b.guest_id
    JOIN provider_profiles pp ON pp.id = l.provider_profile_id
    WHERE pp.user_id = p_user_id
      AND (p_start_date IS NULL OR b.event_start::date >= p_start_date)
      AND (p_end_date IS NULL OR b.event_start::date <= p_end_date)
    ORDER BY b.created_at DESC
  LOOP
    v_csv := v_csv
      || '"' || v_rec.id || '",'
      || '"' || REPLACE(COALESCE(v_rec.listing_title, ''), '"', '""') || '",'
      || '"' || REPLACE(COALESCE(v_rec.guest_name, ''), '"', '""') || '",'
      || '"' || v_rec.event_start || '",'
      || '"' || v_rec.event_end || '",'
      || '"' || v_rec.status || '",'
      || '"' || v_rec.booking_type || '",'
      || v_rec.total_amount_kobo || ','
      || v_rec.commission_kobo || ','
      || '"' || COALESCE(v_rec.paid_at::text, '') || '"'
      || E'\r\n';
  END LOOP;

  RETURN v_csv;
END;
$$;

-- === 4. EXPORT LISTINGS FUNCTION (Admin) ===
CREATE OR REPLACE FUNCTION export_listings_csv(
  p_status TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_csv TEXT;
  v_rec RECORD;
BEGIN
  v_csv := 'listing_id,title,vertical,booking_type,status,city_area,state,base_rate,created_at' || E'\r\n';

  FOR v_rec IN
    SELECT
      l.id,
      l.title,
      l.vertical,
      l.booking_type,
      l.status,
      l.location->>'cityArea' as city_area,
      l.location->>'state' as state,
      (l.pricing->>'baseRatePerHour')::text as base_rate,
      l.created_at
    FROM listings l
    WHERE (p_status IS NULL OR l.status = p_status)
    ORDER BY l.created_at DESC
  LOOP
    v_csv := v_csv
      || '"' || v_rec.id || '",'
      || '"' || REPLACE(COALESCE(v_rec.title, ''), '"', '""') || '",'
      || '"' || v_rec.vertical || '",'
      || '"' || v_rec.booking_type || '",'
      || '"' || v_rec.status || '",'
      || '"' || REPLACE(COALESCE(v_rec.city_area, ''), '"', '""') || '",'
      || '"' || REPLACE(COALESCE(v_rec.state, ''), '"', '""') || '",'
      || COALESCE(v_rec.base_rate, '') || ','
      || '"' || v_rec.created_at || '"'
      || E'\r\n';
  END LOOP;

  RETURN v_csv;
END;
$$;

-- === 5. EXPORT REVENUE FUNCTION ===
CREATE OR REPLACE FUNCTION export_revenue_csv(
  p_host_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_csv TEXT;
  v_rec RECORD;
BEGIN
  v_csv := 'date,listing_title,booking_id,amount_kobo,platform_fee,host_payout,status,reference' || E'\r\n';

  FOR v_rec IN
    SELECT
      pr.created_at::date as tx_date,
      l.title as listing_title,
      pr.booking_id,
      pr.amount_kobo,
      pr.platform_fee_kobo,
      pr.host_payout_kobo,
      pr.status,
      pr.gateway_transaction_ref
    FROM payment_records pr
    JOIN bookings b ON b.id = pr.booking_id
    JOIN listings l ON l.id = b.listing_id
    JOIN provider_profiles pp ON pp.id = l.provider_profile_id
    WHERE pp.user_id = p_host_id
      AND pr.status = 'successful'
      AND (p_start_date IS NULL OR pr.created_at::date >= p_start_date)
      AND (p_end_date IS NULL OR pr.created_at::date <= p_end_date)
    ORDER BY pr.created_at DESC
  LOOP
    v_csv := v_csv
      || '"' || v_rec.tx_date || '",'
      || '"' || REPLACE(COALESCE(v_rec.listing_title, ''), '"', '""') || '",'
      || '"' || v_rec.booking_id || '",'
      || v_rec.amount_kobo || ','
      || COALESCE(v_rec.platform_fee_kobo, 0) || ','
      || COALESCE(v_rec.host_payout_kobo, 0) || ','
      || '"' || v_rec.status || '",'
      || '"' || COALESCE(v_rec.gateway_transaction_ref, '') || '"'
      || E'\r\n';
  END LOOP;

  RETURN v_csv;
END;
$$;

COMMIT;
