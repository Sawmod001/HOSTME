-- Migration: Batch 16 — Search
-- Full-text search, search analytics, autocomplete

BEGIN;

-- === 1. ADD FULL-TEXT SEARCH VECTOR TO listings ===
ALTER TABLE listings ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate search_vector from title and description
CREATE OR REPLACE FUNCTION update_listing_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.location->>'cityArea', '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.location->>'state', '')), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listing_search_vector_trigger ON listings;
CREATE TRIGGER listing_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, description, location ON listings
  FOR EACH ROW EXECUTE FUNCTION update_listing_search_vector();

-- Create GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_listings_search_vector ON listings USING gin (search_vector);

-- Backfill existing listings
UPDATE listings SET search_vector =
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(location->>'cityArea', '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(location->>'state', '')), 'C')
WHERE search_vector IS NULL;

-- === 2. ENHANCED SEARCH FUNCTION ===
-- Full-text search with ranking, filters, and proximity
CREATE OR REPLACE FUNCTION search_listings(
  p_query TEXT DEFAULT NULL,
  p_vertical TEXT DEFAULT NULL,
  p_booking_type TEXT DEFAULT NULL,
  p_city_area TEXT DEFAULT NULL,
  p_sub_vertical TEXT DEFAULT NULL,
  p_min_price INTEGER DEFAULT NULL,
  p_max_price INTEGER DEFAULT NULL,
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL,
  p_radius_km DOUBLE PRECISION DEFAULT 50,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  vertical TEXT,
  booking_type TEXT,
  status TEXT,
  location JSONB,
  pricing JSONB,
  features JSONB,
  media TEXT[],
  created_at TIMESTAMPTZ,
  rank REAL,
  distance_meters DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_query tsquery;
  v_use_fulltext BOOLEAN;
BEGIN
  -- Build tsquery if query provided
  v_use_fulltext := p_query IS NOT NULL AND length(trim(p_query)) > 0;

  IF v_use_fulltext THEN
    -- Convert user query to tsquery (handles phrases, AND, OR)
    v_query := websearch_to_tsquery('english', p_query);
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.title,
    l.description,
    l.vertical,
    l.booking_type,
    l.status,
    l.location,
    l.pricing,
    l.features,
    l.media,
    l.created_at,
    CASE
      WHEN v_use_fulltext THEN ts_rank_cd(l.search_vector, v_query, 32)
      ELSE 0.5
    END as rank,
    CASE
      WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND l.coordinates IS NOT NULL THEN
        ST_Distance(
          l.coordinates::geography,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
        )
      ELSE NULL
    END as distance_meters
  FROM listings l
  WHERE l.status = 'active'
    -- Full-text search filter
    AND (
      NOT v_use_fulltext
      OR l.search_vector @@ v_query
    )
    -- Vertical filter
    AND (p_vertical IS NULL OR l.vertical = p_vertical)
    -- Booking type filter
    AND (p_booking_type IS NULL OR l.booking_type = p_booking_type)
    -- City area filter (case-insensitive partial match)
    AND (p_city_area IS NULL OR l.location->>'cityArea' ILIKE '%' || p_city_area || '%')
    -- Sub-vertical filter
    AND (p_sub_vertical IS NULL OR p_sub_vertical = ANY(l.sub_vertical))
    -- Price range filter
    AND (p_min_price IS NULL OR (l.pricing->>'baseRatePerHour')::integer >= p_min_price)
    AND (p_max_price IS NULL OR (l.pricing->>'baseRatePerHour')::integer <= p_max_price)
    -- Proximity filter
    AND (
      p_lat IS NULL OR p_lng IS NULL OR l.coordinates IS NULL
      OR ST_DWithin(
        l.coordinates::geography,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        p_radius_km * 1000
      )
    )
  ORDER BY
    CASE WHEN v_use_fulltext THEN ts_rank_cd(l.search_vector, v_query, 32) ELSE 0 END DESC,
    CASE WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND l.coordinates IS NOT NULL THEN
      ST_Distance(l.coordinates::geography, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)
    ELSE 0 END ASC,
    l.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- === 3. AUTOCOMPLETE FUNCTION ===
-- Returns title suggestions for partial queries
CREATE OR REPLACE FUNCTION search_autocomplete(
  p_query TEXT,
  p_limit INTEGER DEFAULT 8
)
RETURNS TABLE (
  suggestion TEXT,
  listing_id UUID,
  vertical TEXT,
  city_area TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.title as suggestion,
    l.id as listing_id,
    l.vertical,
    l.location->>'cityArea' as city_area
  FROM listings l
  WHERE l.status = 'active'
    AND (
      l.title ILIKE '%' || p_query || '%'
      OR l.location->>'cityArea' ILIKE '%' || p_query || '%'
    )
  ORDER BY
    -- Exact match first
    CASE WHEN l.title ILIKE p_query THEN 0
         WHEN l.title ILIKE p_query || '%' THEN 1
         ELSE 2
    END,
    l.created_at DESC
  LIMIT p_limit;
END;
$$;

-- === 4. SEARCH ANALYTICS TABLE ===
CREATE TABLE IF NOT EXISTS search_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  query TEXT NOT NULL,
  filters JSONB DEFAULT '{}'::jsonb,
  results_count INTEGER NOT NULL DEFAULT 0,
  clicked_listing_id UUID REFERENCES listings(id),
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON search_analytics (query);
CREATE INDEX IF NOT EXISTS idx_search_analytics_created ON search_analytics (created_at);
CREATE INDEX IF NOT EXISTS idx_search_analytics_user ON search_analytics (user_id)
  WHERE user_id IS NOT NULL;

-- === 5. RLS FOR search_analytics ===
ALTER TABLE search_analytics ENABLE ROW LEVEL SECURITY;

-- Users can read their own search history
CREATE POLICY search_analytics_own_read ON search_analytics
  FOR SELECT
  USING (user_id = auth.uid());

-- System can insert
CREATE POLICY search_analytics_insert ON search_analytics
  FOR INSERT
  WITH CHECK (true);

-- Admin can read all
CREATE POLICY search_analytics_admin_read ON search_analytics
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- === 6. POPULAR SEARCHES FUNCTION ===
CREATE OR REPLACE FUNCTION get_popular_searches(p_days INTEGER DEFAULT 7, p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  query TEXT,
  search_count BIGINT,
  avg_results NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.query,
    count(*) as search_count,
    round(avg(sa.results_count), 1) as avg_results
  FROM search_analytics sa
  WHERE sa.created_at > now() - (p_days || ' days')::interval
    AND length(sa.query) > 0
  GROUP BY sa.query
  ORDER BY count(*) DESC
  LIMIT p_limit;
END;
$$;

COMMIT;
