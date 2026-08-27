-- Migration: Batch 13 — Admin Dashboard
-- Stats, user management improvements, listing moderation

BEGIN;

-- === 1. ADMIN STATS FUNCTION ===
-- Returns comprehensive dashboard stats in a single query
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_stats JSONB;
  v_listing_stats JSONB;
  v_booking_stats JSONB;
  v_user_stats JSONB;
  v_revenue_stats JSONB;
BEGIN
  -- Listing stats
  SELECT jsonb_build_object(
    'total', count(*),
    'active', count(*) FILTER (WHERE status = 'active'),
    'pending_review', count(*) FILTER (WHERE status = 'pending_review'),
    'suspended', count(*) FILTER (WHERE status = 'suspended'),
    'rejected', count(*) FILTER (WHERE status = 'rejected'),
    'archived', count(*) FILTER (WHERE status = 'archived'),
    'venues', count(*) FILTER (WHERE vertical = 'venue'),
    'housing', count(*) FILTER (WHERE vertical = 'housing')
  ) INTO v_listing_stats
  FROM listings;

  -- Booking stats (last 30 days)
  SELECT jsonb_build_object(
    'total', count(*),
    'confirmed', count(*) FILTER (WHERE status = 'confirmed'),
    'completed', count(*) FILTER (WHERE status = 'completed'),
    'cancelled', count(*) FILTER (WHERE status = 'cancelled'),
    'awaiting_payment', count(*) FILTER (WHERE status = 'awaiting_payment'),
    'venues', count(*) FILTER (WHERE booking_type IN ('capacity', 'exclusive')),
    'housing', count(*) FILTER (WHERE booking_type = 'housing')
  ) INTO v_booking_stats
  FROM bookings
  WHERE created_at > now() - INTERVAL '30 days';

  -- User stats
  SELECT jsonb_build_object(
    'total', count(*),
    'guests', count(*) FILTER (WHERE role = 'guest'),
    'venue_hosts', count(*) FILTER (WHERE role = 'venue_host'),
    'housing_agents', count(*) FILTER (WHERE role = 'housing_agent'),
    'admins', count(*) FILTER (WHERE role = 'admin'),
    'new_last_7_days', count(*) FILTER (WHERE created_at > now() - INTERVAL '7 days'),
    'new_last_30_days', count(*) FILTER (WHERE created_at > now() - INTERVAL '30 days')
  ) INTO v_user_stats
  FROM users;

  -- Revenue stats (successful payments last 30 days)
  SELECT jsonb_build_object(
    'total_kobo', COALESCE(sum(amount_kobo), 0),
    'count', count(*),
    'avg_kobo', COALESCE(round(avg(amount_kobo)), 0),
    'escrow_held', count(*) FILTER (WHERE status = 'successful' AND escrow_status = 'held'),
    'escrow_released', count(*) FILTER (WHERE status = 'successful' AND escrow_status = 'released')
  ) INTO v_revenue_stats
  FROM payment_records
  WHERE status = 'successful'
    AND created_at > now() - INTERVAL '30 days';

  -- Pending verifications count
  v_stats := jsonb_build_object(
    'listings', v_listing_stats,
    'bookings', v_booking_stats,
    'users', v_user_stats,
    'revenue', v_revenue_stats,
    'pending_verifications', (
      SELECT count(*) FROM provider_verifications WHERE status = 'pending'
    ),
    'generated_at', now()
  );

  RETURN v_stats;
END;
$$;

-- === 2. ADMIN USER ROLE CHANGE FUNCTION ===
-- Atomically change a user's role with validation
CREATE OR REPLACE FUNCTION admin_change_user_role(
  p_user_id UUID,
  p_new_role TEXT,
  p_admin_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_role TEXT;
  v_valid_roles TEXT[] := ARRAY['guest', 'venue_host', 'housing_agent', 'admin'];
BEGIN
  -- Validate role
  IF NOT (p_new_role = ANY(v_valid_roles)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid role. Must be one of: ' || array_to_string(v_valid_roles, ', '));
  END IF;

  -- Get current role
  SELECT role INTO v_old_role FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'User not found');
  END IF;

  -- Prevent self-demotion
  IF p_user_id = p_admin_id AND p_new_role != 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot change your own admin role');
  END IF;

  -- Update role
  UPDATE users SET role = p_new_role WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'old_role', v_old_role,
    'new_role', p_new_role
  );
END;
$$;

-- === 3. INDEXES for admin queries ===
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings (status);
CREATE INDEX IF NOT EXISTS idx_listings_status_vertical ON listings (status, vertical);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings (created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status_type ON bookings (status, booking_type);

COMMIT;
