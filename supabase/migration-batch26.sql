-- Migration: Batch 26 — Performance
-- Query caching, materialized views, connection pooling indexes, N+1 prevention

BEGIN;

-- === 1. MATERIALIZED VIEW: listing_popularity ===
-- Pre-computed popularity scores for search ranking
CREATE MATERIALIZED VIEW IF NOT EXISTS listing_popularity AS
SELECT
  l.id AS listing_id,
  l.user_id AS host_id,
  l.title,
  l.city,
  l.category,
  l.price_kobo,
  l.is_active,
  COALESCE(booking_stats.total_bookings, 0) AS total_bookings,
  COALESCE(booking_stats.completed_bookings, 0) AS completed_bookings,
  COALESCE(booking_stats.total_revenue_kobo, 0) AS total_revenue_kobo,
  COALESCE(review_stats.avg_rating, 0) AS avg_rating,
  COALESCE(review_stats.review_count, 0) AS review_count,
  COALESCE(view_stats.view_count, 0) AS view_count,
  (
    COALESCE(booking_stats.completed_bookings, 0) * 10 +
    COALESCE(review_stats.review_count, 0) * 5 +
    COALESCE(booking_stats.total_revenue_kobo, 0) / 100000 +
    COALESCE(view_stats.view_count, 0) / 100
  ) AS popularity_score,
  now() AS refreshed_at
FROM listings l
LEFT JOIN (
  SELECT
    listing_id,
    count(*) AS total_bookings,
    count(*) FILTER (WHERE status = 'completed') AS completed_bookings,
    sum(amount_kobo) FILTER (WHERE status = 'completed') AS total_revenue_kobo
  FROM bookings
  GROUP BY listing_id
) booking_stats ON booking_stats.listing_id = l.id
LEFT JOIN (
  SELECT
    listing_id,
    round(avg(rating)::numeric, 2) AS avg_rating,
    count(*) AS review_count
  FROM reviews
  WHERE status = 'approved'
  GROUP BY listing_id
) review_stats ON review_stats.listing_id = l.id
LEFT JOIN (
  SELECT
    listing_id,
    count(*) AS view_count
  FROM listing_views
  WHERE viewed_at > now() - INTERVAL '30 days'
  GROUP BY listing_id
) view_stats ON view_stats.listing_id = l.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_popularity_id ON listing_popularity (listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_popularity_score ON listing_popularity (popularity_score DESC);
CREATE INDEX IF NOT EXISTS idx_listing_popularity_city ON listing_popularity (city, popularity_score DESC);

-- === 2. MATERIALIZED VIEW: host_earnings_summary ===
-- Pre-computed earnings for host dashboard
CREATE MATERIALIZED VIEW IF NOT EXISTS host_earnings_summary AS
SELECT
  b.host_id,
  count(*) FILTER (WHERE b.status = 'completed') AS total_completed_bookings,
  COALESCE(sum(b.total_kobo) FILTER (WHERE b.status = 'completed'), 0) AS total_earnings_kobo,
  COALESCE(sum(b.platform_fee_kobo) FILTER (WHERE b.status = 'completed'), 0) AS total_fees_kobo,
  COALESCE(sum(b.total_kobo) FILTER (
    WHERE b.status = 'completed' AND b.created_at > now() - INTERVAL '30 days'
  ), 0) AS earnings_30d_kobo,
  COALESCE(sum(b.total_kobo) FILTER (
    WHERE b.status = 'completed' AND b.created_at > now() - INTERVAL '7 days'
  ), 0) AS earnings_7d_kobo,
  count(*) FILTER (WHERE b.status = 'pending') AS pending_bookings,
  count(*) FILTER (WHERE b.created_at > now() - INTERVAL '30 days') AS bookings_30d,
  now() AS refreshed_at
FROM bookings b
GROUP BY b.host_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_host_earnings_host ON host_earnings_summary (host_id);

-- === 3. MATERIALIZED VIEW: admin_dashboard_stats ===
-- Pre-computed admin dashboard numbers
CREATE MATERIALIZED VIEW IF NOT EXISTS admin_dashboard_stats AS
SELECT
  (SELECT count(*) FROM users WHERE role = 'guest') AS total_guests,
  (SELECT count(*) FROM users WHERE role = 'host') AS total_hosts,
  (SELECT count(*) FROM users WHERE role = 'admin') AS total_admins,
  (SELECT count(*) FROM listings WHERE is_active = true) AS active_listings,
  (SELECT count(*) FROM listings WHERE is_active = false) AS inactive_listings,
  (SELECT count(*) FROM bookings WHERE status = 'completed') AS completed_bookings,
  (SELECT count(*) FROM bookings WHERE status = 'pending') AS pending_bookings,
  (SELECT count(*) FROM bookings WHERE status = 'cancelled') AS cancelled_bookings,
  (SELECT COALESCE(sum(total_kobo) FILTER (WHERE status = 'completed'), 0) FROM bookings) AS total_revenue_kobo,
  (SELECT COALESCE(sum(platform_fee_kobo) FILTER (WHERE status = 'completed'), 0) FROM bookings) AS total_fees_kobo,
  (SELECT count(*) FROM reviews WHERE status = 'pending') AS pending_reviews,
  (SELECT count(*) FROM reports WHERE status = 'open') AS open_reports,
  (SELECT count(*) FROM disputes WHERE status IN ('filed', 'under_review')) AS open_disputes,
  now() AS refreshed_at;

-- === 4. PERFORMANCE INDEXES ===

-- Bookings: compound indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bookings_host_status ON bookings (host_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_guest_status ON bookings (guest_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_listing_status ON bookings (listing_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings (start_date, end_date) WHERE status NOT IN ('cancelled', 'rejected');

-- Reviews: compound indexes
CREATE INDEX IF NOT EXISTS idx_reviews_listing_status ON reviews (listing_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_booking ON reviews (booking_id);

-- Messages: compound indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (conversation_id, is_read) WHERE is_read = false;

-- Blocked dates: compound indexes
CREATE INDEX IF NOT EXISTS idx_blocked_dates_listing_range ON blocked_dates (listing_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_blocked_dates_user ON blocked_dates (user_id, start_date);

-- Payment records: compound indexes
CREATE INDEX IF NOT EXISTS idx_payment_records_booking ON payment_records (booking_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_records_user ON payment_records (user_id, created_at DESC);

-- Audit log: compound indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log (resource_type, resource_id);

-- Escrow: compound indexes
CREATE INDEX IF NOT EXISTS idx_escrow_releases_booking ON escrow_releases (booking_id, status);

-- Documents: compound indexes
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents (user_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_booking ON documents (booking_id, type);

-- Notifications: compound indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, is_read, created_at DESC);

-- Reports: compound indexes
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user ON reports (reported_user_id);

-- Disputes: compound indexes
CREATE INDEX IF NOT EXISTS idx_disputes_booking ON disputes (booking_id, status);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes (status, created_at DESC);

-- === 5. REFRESH FUNCTION for materialized views ===
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY listing_popularity;
  REFRESH MATERIALIZED VIEW CONCURRENTLY host_earnings_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY admin_dashboard_stats;
END;
$$;

-- === 6. LISTING VIEWS table (for popularity tracking) ===
CREATE TABLE IF NOT EXISTS listing_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id UUID,
  ip_address INET,
  user_agent TEXT,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_views_listing ON listing_views (listing_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_listing_views_user ON listing_views (user_id) WHERE user_id IS NOT NULL;

-- Track a listing view
CREATE OR REPLACE FUNCTION track_listing_view(
  p_listing_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO listing_views (listing_id, user_id, ip_address, user_agent)
  VALUES (p_listing_id, p_user_id, p_ip_address, p_user_agent);
END;
$$;

-- === 7. QUERY PLAN HINTS via comments ===
-- These help Postgres choose the right indexes
COMMENT ON INDEX idx_bookings_host_status IS 'Host dashboard: list bookings by status';
COMMENT ON INDEX idx_bookings_guest_status IS 'Guest dashboard: list bookings by status';
COMMENT ON INDEX idx_bookings_listing_status IS 'Listing page: check booking status';
COMMENT ON INDEX idx_messages_conversation IS 'Message thread: fetch messages';
COMMENT ON INDEX idx_messages_unread IS 'Notification badge: count unread messages';
COMMENT ON INDEX idx_reviews_listing_status IS 'Listing page: approved reviews';
COMMENT ON INDEX idx_notifications_user_read IS 'Notification bell: unread count';
COMMENT ON INDEX idx_blocked_dates_listing_range IS 'Calendar: check date availability';

COMMIT;
