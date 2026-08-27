-- Migration: Batch 15 — Analytics & Reporting
-- Host analytics, revenue reports, platform metrics

BEGIN;

-- === 1. HOST ANALYTICS FUNCTION ===
-- Returns comprehensive stats for a host's listings
CREATE OR REPLACE FUNCTION get_host_analytics(p_host_id UUID, p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_listing_ids UUID[];
  v_stats JSONB;
  v_booking_stats JSONB;
  v_revenue_stats JSONB;
  v_listing_performance JSONB;
BEGIN
  -- Get host's listing IDs
  SELECT array_agg(l.id) INTO v_listing_ids
  FROM listings l
  JOIN provider_profiles pp ON pp.id = l.provider_profile_id
  WHERE pp.user_id = p_host_id;

  IF v_listing_ids IS NULL OR array_length(v_listing_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'listings', 0,
      'bookings', jsonb_build_object('total', 0),
      'revenue', jsonb_build_object('total_kobo', 0),
      'period_days', p_days
    );
  END IF;

  -- Booking stats
  SELECT jsonb_build_object(
    'total', count(*),
    'confirmed', count(*) FILTER (WHERE status = 'confirmed'),
    'completed', count(*) FILTER (WHERE status = 'completed'),
    'cancelled', count(*) FILTER (WHERE status = 'cancelled'),
    'awaiting_payment', count(*) FILTER (WHERE status = 'awaiting_payment'),
    'occupancy_rate', CASE
      WHEN count(*) > 0 THEN
        round(count(*) FILTER (WHERE status IN ('confirmed', 'completed'))::numeric / count(*)::numeric * 100, 1)
      ELSE 0
    END
  ) INTO v_booking_stats
  FROM bookings
  WHERE listing_id = ANY(v_listing_ids)
    AND created_at > now() - (p_days || ' days')::interval;

  -- Revenue stats
  SELECT jsonb_build_object(
    'total_kobo', COALESCE(sum(amount_kobo), 0),
    'platform_fees_kobo', COALESCE(sum(platform_fee_kobo), 0),
    'host_payouts_kobo', COALESCE(sum(host_payout_kobo), 0),
    'escrow_held_kobo', COALESCE(sum(amount_kobo) FILTER (WHERE escrow_status = 'held'), 0),
    'escrow_released_kobo', COALESCE(sum(amount_kobo) FILTER (WHERE escrow_status = 'released'), 0),
    'transaction_count', count(*),
    'avg_transaction_kobo', COALESCE(round(avg(amount_kobo)), 0)
  ) INTO v_revenue_stats
  FROM payment_records pr
  JOIN bookings b ON b.id = pr.booking_id
  WHERE b.listing_id = ANY(v_listing_ids)
    AND pr.status = 'successful'
    AND pr.created_at > now() - (p_days || ' days')::interval;

  -- Per-listing performance
  SELECT jsonb_agg(
    jsonb_build_object(
      'listing_id', l.id,
      'title', l.title,
      'vertical', l.vertical,
      'status', l.status,
      'total_bookings', COALESCE(bs.total, 0),
      'revenue_kobo', COALESCE(rs.total_kobo, 0),
      'occupancy_rate', COALESCE(bs.occupancy_rate, 0)
    )
  ) INTO v_listing_performance
  FROM listings l
  LEFT JOIN LATERAL (
    SELECT
      count(*) as total,
      round(count(*) FILTER (WHERE status IN ('confirmed', 'completed'))::numeric /
            GREATEST(count(*), 1)::numeric * 100, 1) as occupancy_rate
    FROM bookings
    WHERE listing_id = l.id
      AND created_at > now() - (p_days || ' days')::interval
  ) bs ON true
  LEFT JOIN LATERAL (
    SELECT sum(pr.amount_kobo) as total_kobo
    FROM payment_records pr
    JOIN bookings b ON b.id = pr.booking_id
    WHERE b.listing_id = l.id
      AND pr.status = 'successful'
      AND pr.created_at > now() - (p_days || ' days')::interval
  ) rs ON true
  WHERE l.id = ANY(v_listing_ids);

  v_stats := jsonb_build_object(
    'listings', array_length(v_listing_ids, 1),
    'bookings', v_booking_stats,
    'revenue', v_revenue_stats,
    'listing_performance', COALESCE(v_listing_performance, '[]'::jsonb),
    'period_days', p_days,
    'generated_at', now()
  );

  RETURN v_stats;
END;
$$;

-- === 2. REVENUE REPORT FUNCTION ===
-- Detailed revenue breakdown for a host over a date range
CREATE OR REPLACE FUNCTION get_revenue_report(
  p_host_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_start DATE;
  v_end DATE;
  v_daily_revenue JSONB;
  v_total JSONB;
BEGIN
  v_start := COALESCE(p_start_date, (now() - INTERVAL '30 days')::date);
  v_end := COALESCE(p_end_date, now()::date);

  -- Daily revenue breakdown
  SELECT jsonb_agg(day_data ORDER BY day_data->>'date')
  INTO v_daily_revenue
  FROM (
    SELECT jsonb_build_object(
      'date', pr.created_at::date,
      'revenue_kobo', sum(pr.amount_kobo),
      'transactions', count(*),
      'platform_fees', sum(pr.platform_fee_kobo),
      'host_payouts', sum(pr.host_payout_kobo)
    ) as day_data
    FROM payment_records pr
    JOIN bookings b ON b.id = pr.booking_id
    JOIN listings l ON l.id = b.listing_id
    JOIN provider_profiles pp ON pp.id = l.provider_profile_id
    WHERE pp.user_id = p_host_id
      AND pr.status = 'successful'
      AND pr.created_at::date BETWEEN v_start AND v_end
    GROUP BY pr.created_at::date
  ) daily;

  -- Total summary
  SELECT jsonb_build_object(
    'total_revenue_kobo', COALESCE(sum(pr.amount_kobo), 0),
    'total_platform_fees', COALESCE(sum(pr.platform_fee_kobo), 0),
    'total_host_payouts', COALESCE(sum(pr.host_payout_kobo), 0),
    'total_transactions', count(*),
    'avg_transaction', COALESCE(round(avg(pr.amount_kobo)), 0),
    'start_date', v_start,
    'end_date', v_end
  ) INTO v_total
  FROM payment_records pr
  JOIN bookings b ON b.id = pr.booking_id
  JOIN listings l ON l.id = b.listing_id
  JOIN provider_profiles pp ON pp.id = l.provider_profile_id
  WHERE pp.user_id = p_host_id
    AND pr.status = 'successful'
    AND pr.created_at::date BETWEEN v_start AND v_end;

  RETURN jsonb_build_object(
    'summary', v_total,
    'daily', COALESCE(v_daily_revenue, '[]'::jsonb)
  );
END;
$$;

-- === 3. LISTING ANALYTICS FUNCTION ===
-- Detailed analytics for a single listing
CREATE OR REPLACE FUNCTION get_listing_analytics(
  p_listing_id UUID,
  p_host_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_stats JSONB;
BEGIN
  -- Verify host owns the listing
  IF NOT EXISTS(
    SELECT 1 FROM listings l
    JOIN provider_profiles pp ON pp.id = l.provider_profile_id
    WHERE l.id = p_listing_id AND pp.user_id = p_host_id
  ) THEN
    RETURN jsonb_build_object('error', 'Listing not found or not owned by you');
  END IF;

  SELECT jsonb_build_object(
    'listing_id', p_listing_id,
    'period_days', p_days,
    'bookings', (
      SELECT jsonb_build_object(
        'total', count(*),
        'confirmed', count(*) FILTER (WHERE status = 'confirmed'),
        'completed', count(*) FILTER (WHERE status = 'completed'),
        'cancelled', count(*) FILTER (WHERE status = 'cancelled'),
        'revenue_kobo', COALESCE(sum(total_amount_kobo) FILTER (WHERE status IN ('confirmed', 'completed')), 0)
      )
      FROM bookings
      WHERE listing_id = p_listing_id
        AND created_at > now() - (p_days || ' days')::interval
    ),
    'occupancy', (
      SELECT jsonb_build_object(
        'total_dates', count(*),
        'booked_dates', count(*) FILTER (WHERE reason LIKE 'booking%'),
        'host_blocked', count(*) FILTER (WHERE reason = 'host_blocked'),
        'occupancy_rate', CASE
          WHEN count(*) > 0 THEN
            round(count(*) FILTER (WHERE reason LIKE 'booking%')::numeric / count(*)::numeric * 100, 1)
          ELSE 0
        END
      )
      FROM blocked_dates
      WHERE listing_id = p_listing_id
        AND blocked_date > (now() - (p_days || ' days')::date)
        AND blocked_date <= now()::date
    ),
    'reviews', (
      SELECT jsonb_build_object(
        'count', count(*),
        'avg_rating', COALESCE(round(avg(rating)::numeric, 1), 0),
        'rating_distribution', jsonb_build_object(
          '5', count(*) FILTER (WHERE rating = 5),
          '4', count(*) FILTER (WHERE rating = 4),
          '3', count(*) FILTER (WHERE rating = 3),
          '2', count(*) FILTER (WHERE rating = 2),
          '1', count(*) FILTER (WHERE rating = 1)
        )
      )
      FROM reviews
      WHERE listing_id = p_listing_id
    )
  ) INTO v_stats;

  RETURN v_stats;
END;
$$;

COMMIT;
