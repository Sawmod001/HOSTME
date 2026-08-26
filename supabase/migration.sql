-- =============================================================================
-- HostMe Supabase Migration — Batch 1: Auth + Authorization + Account Model
-- =============================================================================
-- IMPORTANT: Run this in a transaction. If anything fails, nothing is applied.
-- Migration order: ADD → BACKFILL → VALIDATE → SWITCH READS → SWITCH WRITES → REMOVE LEGACY
-- =============================================================================

-- Enable PostGIS for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- =============================================================================
-- ENUMS
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE provider_type AS ENUM ('venue_host', 'housing_agent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE verification_status AS ENUM ('none', 'pending', 'approved', 'rejected', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE verification_kind AS ENUM ('identity', 'business', 'property_authority');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE verification_state AS ENUM ('pending', 'approved', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- USERS (modified)
-- - Add role TEXT column (single role per user, not array)
-- - Drop legacy roles[] and active_role columns (superseded by role)
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'guest'
  CHECK (role IN ('guest', 'venue_host', 'housing_agent', 'admin'));

-- Backfill role from existing roles array
UPDATE users SET role = CASE
  WHEN 'admin' = ANY(roles) THEN 'admin'
  WHEN 'host' = ANY(roles) THEN 'venue_host'
  ELSE 'guest'
END
WHERE role = 'guest' OR role IS NULL;

ALTER TABLE users ALTER COLUMN role SET NOT NULL;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'guest';

-- Drop legacy columns — role column is now the source of truth
ALTER TABLE users DROP COLUMN IF EXISTS roles;
ALTER TABLE users DROP COLUMN IF EXISTS active_role;

-- =============================================================================
-- PROVIDER PROFILES
-- One profile per user. A user is either a venue_host or housing_agent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS provider_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_type provider_type NOT NULL,
  business_name TEXT,
  business_type TEXT,
  display_name TEXT,
  verification_status verification_status NOT NULL DEFAULT 'none',
  verified_at TIMESTAMPTZ,
  suspension_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_profiles_user_id ON provider_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_type ON provider_profiles(provider_type);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_verification ON provider_profiles(verification_status);

ALTER TABLE provider_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "provider_profiles_read_own" ON provider_profiles;
CREATE POLICY "provider_profiles_read_own" ON provider_profiles
  FOR SELECT USING (user_id::text = current_setting('app.user_id', true));

DROP POLICY IF EXISTS "provider_profiles_insert_own" ON provider_profiles;
CREATE POLICY "provider_profiles_insert_own" ON provider_profiles
  FOR INSERT WITH CHECK (user_id::text = current_setting('app.user_id', true));

DROP POLICY IF EXISTS "provider_profiles_update_own" ON provider_profiles;
CREATE POLICY "provider_profiles_update_own" ON provider_profiles
  FOR UPDATE USING (user_id::text = current_setting('app.user_id', true));

-- =============================================================================
-- PROVIDER VERIFICATIONS
-- Separate domain from provider profiles. Tracks identity, business, and
-- property-authority verification per provider.
-- =============================================================================

CREATE TABLE IF NOT EXISTS provider_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_profile_id UUID NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  verification_type verification_kind NOT NULL,
  status verification_state NOT NULL DEFAULT 'pending',
  documents JSONB DEFAULT '[]'::jsonb,
  review_note TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_verifications_profile ON provider_verifications(provider_profile_id);
CREATE INDEX IF NOT EXISTS idx_provider_verifications_status ON provider_verifications(status);

ALTER TABLE provider_verifications ENABLE ROW LEVEL SECURITY;

-- Provider can read own verifications
DROP POLICY IF EXISTS "provider_verifications_read_own" ON provider_verifications;
CREATE POLICY "provider_verifications_read_own" ON provider_verifications
  FOR SELECT USING (
    provider_profile_id IN (
      SELECT id FROM provider_profiles WHERE user_id::text = current_setting('app.user_id', true)
    )
  );

-- Provider can insert own verifications (submit new request)
DROP POLICY IF EXISTS "provider_verifications_insert_own" ON provider_verifications;
CREATE POLICY "provider_verifications_insert_own" ON provider_verifications
  FOR INSERT WITH CHECK (
    provider_profile_id IN (
      SELECT id FROM provider_profiles WHERE user_id::text = current_setting('app.user_id', true)
    )
    AND status = 'pending'
  );

-- Provider can update own pending verifications (replace documents before admin review)
DROP POLICY IF EXISTS "provider_verifications_update_own" ON provider_verifications;
CREATE POLICY "provider_verifications_update_own" ON provider_verifications
  FOR UPDATE USING (
    provider_profile_id IN (
      SELECT id FROM provider_profiles WHERE user_id::text = current_setting('app.user_id', true)
    )
    AND status = 'pending'
  );

-- Admin can read all verifications (using service_role, bypasses RLS — but for safety)
DROP POLICY IF EXISTS "provider_verifications_admin_read" ON provider_verifications;
CREATE POLICY "provider_verifications_admin_read" ON provider_verifications
  FOR SELECT USING (
    current_setting('app.user_role', true) = 'admin'
  );

-- Admin can update all verifications (approve/reject)
DROP POLICY IF EXISTS "provider_verifications_admin_update" ON provider_verifications;
CREATE POLICY "provider_verifications_admin_update" ON provider_verifications
  FOR UPDATE USING (
    current_setting('app.user_role', true) = 'admin'
  );

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_provider_verifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS provider_verifications_updated_at ON provider_verifications;
CREATE TRIGGER provider_verifications_updated_at
  BEFORE UPDATE ON provider_verifications
  FOR EACH ROW
  EXECUTE FUNCTION update_provider_verifications_updated_at();

-- =============================================================================
-- AUDIT LOGS
-- Append-only audit trail for sensitive operations.
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- MIGRATE EXISTING HOSTS TO PROVIDER_PROFILES
-- Mark as legacy_migrated — NOT auto-verified.
-- =============================================================================

INSERT INTO provider_profiles (user_id, provider_type, business_name, business_type, verification_status)
SELECT
  id,
  'venue_host'::provider_type,
  COALESCE(profile->>'businessName', 'Legacy Host'),
  COALESCE(profile->>'businessType', 'venue_owner'),
  'none'::verification_status
FROM users
WHERE 'host' = ANY(roles)
  AND NOT EXISTS (
    SELECT 1 FROM provider_profiles WHERE user_id = users.id
  );

-- =============================================================================
-- LISTINGS (modified)
-- Add provider_profile_id, backfill from host_id, then drop host_id
-- =============================================================================

-- Step 1: Add new column
ALTER TABLE listings ADD COLUMN IF NOT EXISTS provider_profile_id UUID REFERENCES provider_profiles(id);

-- Step 2: Backfill from host_id via provider_profiles
UPDATE listings l
SET provider_profile_id = pp.id
FROM provider_profiles pp
WHERE pp.user_id = l.host_id
  AND l.provider_profile_id IS NULL;

-- Step 3: Make NOT NULL after backfill
ALTER TABLE listings ALTER COLUMN provider_profile_id SET NOT NULL;

-- Step 4: Drop old host_id column and its index
DROP INDEX IF EXISTS idx_listings_host_id;
ALTER TABLE listings DROP COLUMN host_id;

-- Step 5: Add new index
CREATE INDEX IF NOT EXISTS idx_listings_provider_profile_id ON listings(provider_profile_id);

-- =============================================================================
-- UPDATE RLS POLICIES
-- Switch from host_id to provider_profile_id ownership checks
-- =============================================================================

-- Users: keep existing policies
DROP POLICY IF EXISTS "users_read_own" ON users;
CREATE POLICY "users_read_own" ON users
  FOR SELECT USING (clerk_id = current_setting('app.clerk_id', true));
DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (clerk_id = current_setting('app.clerk_id', true));

-- Listings: switch to provider_profile_id ownership
DROP POLICY IF EXISTS "listings_read_active" ON listings;
CREATE POLICY "listings_read_active" ON listings
  FOR SELECT USING (status = 'active');

DROP POLICY IF EXISTS "listings_read_own" ON listings;
CREATE POLICY "listings_read_own" ON listings
  FOR SELECT USING (
    provider_profile_id IN (
      SELECT id FROM provider_profiles WHERE user_id::text = current_setting('app.user_id', true)
    )
  );

DROP POLICY IF EXISTS "listings_insert_own" ON listings;
CREATE POLICY "listings_insert_own" ON listings
  FOR INSERT WITH CHECK (
    provider_profile_id IN (
      SELECT id FROM provider_profiles WHERE user_id::text = current_setting('app.user_id', true)
    )
  );

DROP POLICY IF EXISTS "listings_update_own" ON listings;
CREATE POLICY "listings_update_own" ON listings
  FOR UPDATE USING (
    provider_profile_id IN (
      SELECT id FROM provider_profiles WHERE user_id::text = current_setting('app.user_id', true)
    )
  );

-- Bookings: update to use provider_profile_id for host ownership
DROP POLICY IF EXISTS "bookings_read_own" ON bookings;
CREATE POLICY "bookings_read_own" ON bookings
  FOR SELECT USING (
    guest_id::text = current_setting('app.user_id', true)
    OR listing_id IN (
      SELECT l.id FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE pp.user_id::text = current_setting('app.user_id', true)
    )
  );

DROP POLICY IF EXISTS "bookings_insert" ON bookings;
CREATE POLICY "bookings_insert" ON bookings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "bookings_update_own" ON bookings;
CREATE POLICY "bookings_update_own" ON bookings
  FOR UPDATE USING (guest_id::text = current_setting('app.user_id', true));

-- Reviews, slots, locks, holds, webhooks: keep existing policies
DROP POLICY IF EXISTS "reviews_read" ON reviews;
CREATE POLICY "reviews_read" ON reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS "reviews_insert_own" ON reviews;
CREATE POLICY "reviews_insert_own" ON reviews
  FOR INSERT WITH CHECK (guest_id::text = current_setting('app.user_id', true));

DROP POLICY IF EXISTS "slots_read" ON slots;
CREATE POLICY "slots_read" ON slots FOR SELECT USING (true);
DROP POLICY IF EXISTS "exclusive_locks_read" ON exclusive_locks;
CREATE POLICY "exclusive_locks_read" ON exclusive_locks FOR SELECT USING (true);
DROP POLICY IF EXISTS "soft_holds_read" ON soft_holds;
CREATE POLICY "soft_holds_read" ON soft_holds FOR SELECT USING (true);
DROP POLICY IF EXISTS "webhooks_insert" ON processed_webhooks;
CREATE POLICY "webhooks_insert" ON processed_webhooks FOR INSERT WITH CHECK (true);

-- Group plans: keep existing policies
DROP POLICY IF EXISTS "group_plans_read" ON group_plans;
CREATE POLICY "group_plans_read" ON group_plans FOR SELECT USING (true);
DROP POLICY IF EXISTS "group_plans_insert_own" ON group_plans;
CREATE POLICY "group_plans_insert_own" ON group_plans
  FOR INSERT WITH CHECK (created_by::text = current_setting('app.user_id', true));
DROP POLICY IF EXISTS "plan_members_read" ON plan_members;
CREATE POLICY "plan_members_read" ON plan_members FOR SELECT USING (true);
DROP POLICY IF EXISTS "plan_members_insert_own" ON plan_members;
CREATE POLICY "plan_members_insert_own" ON plan_members
  FOR INSERT WITH CHECK (user_id::text = current_setting('app.user_id', true));

-- =============================================================================
-- STORAGE: public read for listing images
-- =============================================================================

DROP POLICY IF EXISTS "listings_storage_select" ON storage.objects;
CREATE POLICY "listings_storage_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'HOSTME');

-- =============================================================================
-- FUNCTIONS (unchanged from original — keep PostGIS search + atomic ops)
-- =============================================================================

CREATE OR REPLACE FUNCTION search_listings_nearby(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION DEFAULT 50,
  p_vertical TEXT DEFAULT NULL,
  p_city_area TEXT DEFAULT NULL,
  p_booking_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID, provider_profile_id UUID, vertical TEXT, sub_vertical TEXT[], booking_type TEXT,
  status TEXT, title TEXT, description TEXT, location JSONB, pricing JSONB,
  operational_rules JSONB, features JSONB, media TEXT[], add_ons JSONB,
  distance_meters DOUBLE PRECISION
)
LANGUAGE sql STABLE
AS $$
  SELECT
    l.id, l.provider_profile_id, l.vertical, l.sub_vertical, l.booking_type,
    l.status, l.title, l.description, l.location, l.pricing,
    l.operational_rules, l.features, l.media, l.add_ons,
    ST_Distance(l.coordinates, ST_MakePoint(p_lng, p_lat)::geography) AS distance_meters
  FROM listings l
  WHERE l.status = 'active'
    AND l.coordinates IS NOT NULL
    AND ST_DWithin(l.coordinates, ST_MakePoint(p_lng, p_lat)::geography, p_radius_km * 1000)
    AND (p_vertical IS NULL OR l.vertical = p_vertical)
    AND (p_city_area IS NULL OR l.location->>'cityArea' = p_city_area)
    AND (p_booking_type IS NULL OR l.booking_type = p_booking_type)
  ORDER BY distance_meters
  LIMIT p_limit
  OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION reserve_capacity_slot(
  p_slot_id UUID,
  p_listing_id UUID,
  p_headcount INTEGER
)
RETURNS TABLE (id UUID, listing_id UUID, event_start TIMESTAMPTZ, event_end TIMESTAMPTZ, capacity INTEGER, booked INTEGER)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE slots
  SET booked = booked + p_headcount
  WHERE id = p_slot_id
    AND listing_id = p_listing_id
    AND booked + p_headcount <= capacity
  RETURNING id, listing_id, event_start, event_end, capacity, booked;
END;
$$;

CREATE OR REPLACE FUNCTION resolve_exclusive_lock(
  p_lock_id UUID,
  p_booking_id UUID,
  p_listing_id UUID,
  p_event_start TIMESTAMPTZ
)
RETURNS TABLE (id UUID, status TEXT, locked_by_booking_id UUID)
LANGUAGE plpgsql
AS $$
DECLARE
  v_lock RECORD;
BEGIN
  UPDATE exclusive_locks
  SET status = 'locked', locked_by_booking_id = p_booking_id
  WHERE id = p_lock_id AND status = 'open'
  RETURNING * INTO v_lock;

  IF v_lock.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE bookings SET status = 'confirmed' WHERE id = p_booking_id;

  UPDATE bookings
  SET status = 'rejected'
  WHERE listing_id = p_listing_id
    AND event_start = p_event_start
    AND id != p_booking_id
    AND status IN ('pending', 'awaiting_payment');

  RETURN QUERY SELECT v_lock.id, v_lock.status, v_lock.locked_by_booking_id;
END;
$$;

CREATE OR REPLACE FUNCTION release_expired_holds()
RETURNS TABLE (released INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER := 0;
  v_hold RECORD;
BEGIN
  FOR v_hold IN
    SELECT sh.id, sh.slot_id, sh.headcount
    FROM soft_holds sh
    WHERE sh.expires_at <= now()
      AND sh.booking_id IS NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE slots SET booked = GREATEST(booked - v_hold.headcount, 0)
    WHERE id = v_hold.slot_id;

    DELETE FROM soft_holds WHERE id = v_hold.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$$;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS listings_updated_at ON listings;
CREATE TRIGGER listings_updated_at BEFORE UPDATE ON listings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS bookings_updated_at ON bookings;
CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS slots_updated_at ON slots;
CREATE TRIGGER slots_updated_at BEFORE UPDATE ON slots FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS exclusive_locks_updated_at ON exclusive_locks;
CREATE TRIGGER exclusive_locks_updated_at BEFORE UPDATE ON exclusive_locks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS reviews_updated_at ON reviews;
CREATE TRIGGER reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS processed_webhooks_updated_at ON processed_webhooks;
CREATE TRIGGER processed_webhooks_updated_at BEFORE UPDATE ON processed_webhooks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS provider_profiles_updated_at ON provider_profiles;
CREATE TRIGGER provider_profiles_updated_at BEFORE UPDATE ON provider_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- HOUSING: blocked_dates table + availability check function
-- =============================================================================

CREATE TABLE IF NOT EXISTS blocked_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  blocked_date DATE NOT NULL,
  reason TEXT DEFAULT 'host_blocked',
  booking_id UUID REFERENCES bookings(id) DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(listing_id, blocked_date)
);

CREATE INDEX IF NOT EXISTS idx_blocked_dates_listing ON blocked_dates(listing_id);
CREATE INDEX IF NOT EXISTS idx_blocked_dates_date ON blocked_dates(blocked_date);

ALTER TABLE blocked_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocked_dates_read_public" ON blocked_dates;
CREATE POLICY "blocked_dates_read_public" ON blocked_dates
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "blocked_dates_insert_own" ON blocked_dates;
CREATE POLICY "blocked_dates_insert_own" ON blocked_dates
  FOR INSERT WITH CHECK (
    listing_id IN (
      SELECT l.id FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE pp.user_id::text = current_setting('app.user_id', true)
    )
  );

DROP POLICY IF EXISTS "blocked_dates_delete_own" ON blocked_dates;
CREATE POLICY "blocked_dates_delete_own" ON blocked_dates
  FOR DELETE USING (
    listing_id IN (
      SELECT l.id FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE pp.user_id::text = current_setting('app.user_id', true)
    )
  );

-- Check if a date range is available for a housing listing
CREATE OR REPLACE FUNCTION check_housing_availability(
  p_listing_id UUID,
  p_check_in DATE,
  p_check_out DATE
)
RETURNS TABLE (available BOOLEAN, blocked_dates DATE[])
LANGUAGE sql STABLE
AS $$
  SELECT
    NOT EXISTS (
      SELECT 1 FROM blocked_dates bd
      WHERE bd.listing_id = p_listing_id
        AND bd.blocked_date >= p_check_in
        AND bd.blocked_date < p_check_out
    ) AS available,
    COALESCE(
      ARRAY(
        SELECT bd.blocked_date FROM blocked_dates bd
        WHERE bd.listing_id = p_listing_id
          AND bd.blocked_date >= p_check_in
          AND bd.blocked_date < p_check_out
        ORDER BY bd.blocked_date
      ),
      ARRAY[]::DATE[]
    ) AS blocked_dates;
$$;

-- =============================================================================
-- GROUP PLANS (keep as-is for now, deprecated in later batch)
-- =============================================================================

CREATE TABLE IF NOT EXISTS group_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id) NOT NULL,
  slot_id UUID REFERENCES slots(id) NOT NULL,
  created_by UUID REFERENCES users(id) NOT NULL,
  target_headcount INTEGER NOT NULL CHECK (target_headcount >= 1),
  event_start TIMESTAMPTZ NOT NULL,
  event_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finalized', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  finalized_booking_id UUID REFERENCES bookings(id) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_plans_listing ON group_plans(listing_id);
CREATE INDEX IF NOT EXISTS idx_group_plans_created_by ON group_plans(created_by);
CREATE INDEX IF NOT EXISTS idx_group_plans_status ON group_plans(status);

ALTER TABLE group_plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS plan_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES group_plans(id) NOT NULL,
  user_id UUID REFERENCES users(id) NOT NULL,
  headcount INTEGER NOT NULL CHECK (headcount >= 1),
  add_ons JSONB DEFAULT '[]'::jsonb,
  share_amount_kobo INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'confirmed')),
  gateway_transaction_ref TEXT UNIQUE DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(plan_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_members_plan ON plan_members(plan_id);

ALTER TABLE plan_members ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS group_plans_updated_at ON group_plans;
CREATE TRIGGER group_plans_updated_at BEFORE UPDATE ON group_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS plan_members_updated_at ON plan_members;
CREATE TRIGGER plan_members_updated_at BEFORE UPDATE ON plan_members FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION cancel_expired_group_plans()
RETURNS TABLE (cancelled INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  UPDATE group_plans
     SET status = 'cancelled',
         updated_at = now()
   WHERE status = 'active'
     AND expires_at <= now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$;
