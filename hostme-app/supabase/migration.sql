-- =============================================================================
-- HostMe Supabase Migration — Full Schema
-- Run this once in the Supabase SQL editor before starting the app.
-- =============================================================================

-- Enable PostGIS for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- =============================================================================
-- USERS
-- Mirrors Clerk user. All auth state lives in Clerk; this table stores
-- platform-specific profile data and role assignments.
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id TEXT UNIQUE,                                       -- Clerk user ID
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT DEFAULT NULL,
  roles TEXT[] DEFAULT ARRAY['guest'],                        -- ['guest'], ['guest','host'], etc.
  active_role TEXT DEFAULT 'guest',                           -- UI context only (never auth boundary)
  email_verified_at TIMESTAMPTZ DEFAULT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending')),
  is_email_verified BOOLEAN DEFAULT false,
  otp_code TEXT DEFAULT NULL,                                 -- deprecated (Clerk handles OTP)
  otp_expires_at TIMESTAMPTZ DEFAULT NULL,                    -- deprecated
  profile_completed BOOLEAN DEFAULT false,
  profile JSONB DEFAULT '{}'::jsonb,                          -- {fullName, phone, gender, location, bio, businessName, businessType, ...}
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- LISTINGS
-- Every listing has a booking_type ('capacity' or 'exclusive') that determines
-- which engine handles its bookings. JSONB columns (pricing, location, etc.)
-- keep the flexibility of the original document model.
-- =============================================================================
CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID REFERENCES users(id) NOT NULL,
  vertical TEXT NOT NULL CHECK (vertical IN ('venue', 'housing', 'preorder')),
  sub_vertical TEXT[] DEFAULT ARRAY[]::TEXT[],                -- e.g. ['group_night', 'karaoke']
  booking_type TEXT NOT NULL CHECK (booking_type IN ('capacity', 'exclusive')),
  physical_space_id TEXT DEFAULT NULL,                         -- groups same physical venue across listings
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'active', 'suspended', 'rejected')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location JSONB NOT NULL,                                     -- {state, cityArea, address, coordinates: {type, coordinates}}
  pricing JSONB DEFAULT '{}'::jsonb,                           -- {baseRatePerHour (kobo), inspectionTransportFee}
  operational_rules JSONB DEFAULT '{}'::jsonb,                 -- {maxCapacity, setupTimeMinutes, cleanupTimeMinutes, isByobAllowed, cancellationPolicy}
  features JSONB DEFAULT '{}'::jsonb,                          -- vertical-specific feature flags
  rejection_reason TEXT DEFAULT NULL,
  media TEXT[] DEFAULT ARRAY[]::TEXT[],
  add_ons JSONB DEFAULT '[]'::jsonb,                           -- [{id, name, priceInKobo, isRequired}]
  coordinates GEOGRAPHY(POINT, 4326) DEFAULT NULL,             -- PostGIS point for geo queries
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listings_host_id ON listings(host_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_vertical ON listings(vertical);
CREATE INDEX IF NOT EXISTS idx_listings_coordinates ON listings USING GIST(coordinates);

ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- BOOKINGS
-- Shared by both booking engines. The booking_type column is denormalized
-- from the listing for fast filtered queries.
-- =============================================================================
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id) NOT NULL,
  guest_id UUID REFERENCES users(id) DEFAULT NULL,
  booking_type TEXT NOT NULL CHECK (booking_type IN ('capacity', 'exclusive')),
  event_start TIMESTAMPTZ NOT NULL,
  event_end TIMESTAMPTZ NOT NULL,
  headcount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'awaiting_payment', 'confirmed', 'rejected',
      'lost_race', 'expired', 'cancelled', 'completed', 'disputed'
    )),
  gateway_transaction_ref TEXT UNIQUE DEFAULT NULL,            -- idempotency key for webhooks
  total_amount_kobo INTEGER NOT NULL,
  commission_kobo INTEGER NOT NULL,                            -- 5% of total, stored for audit trail
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_listing_id ON bookings(listing_id);
CREATE INDEX IF NOT EXISTS idx_bookings_guest_id ON bookings(guest_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_gateway_ref ON bookings(gateway_transaction_ref)
  WHERE gateway_transaction_ref IS NOT NULL;                   -- partial unique index

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SLOTS (Capacity-Based Engine)
-- One document per bookable time window. The atomic unit that prevents
-- overselling — never compute remaining capacity by summing bookings.
-- =============================================================================
CREATE TABLE IF NOT EXISTS slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id) NOT NULL,
  event_start TIMESTAMPTZ NOT NULL,
  event_end TIMESTAMPTZ NOT NULL,
  capacity INTEGER NOT NULL,
  booked INTEGER NOT NULL DEFAULT 0,                            -- confirmed + soft-held headcount
  held_until TIMESTAMPTZ DEFAULT NULL,                          -- earliest expiry among active holds
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_slots_listing_time ON slots(listing_id, event_start);
CREATE INDEX IF NOT EXISTS idx_slots_listing_id ON slots(listing_id);

ALTER TABLE slots ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- EXCLUSIVE LOCKS (Exclusive-Space Engine)
-- "First-to-pay wins" mechanism. One row per date/time window.
-- =============================================================================
CREATE TABLE IF NOT EXISTS exclusive_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id) NOT NULL,
  event_start TIMESTAMPTZ NOT NULL,
  event_end TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'locked')),
  locked_by_booking_id UUID REFERENCES bookings(id) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exclusive_locks_listing_time ON exclusive_locks(listing_id, event_start);
CREATE INDEX IF NOT EXISTS idx_exclusive_locks_listing_id ON exclusive_locks(listing_id);

ALTER TABLE exclusive_locks ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- REVIEWS & RATINGS
-- Users can leave a review for a listing after a completed booking.
-- =============================================================================
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id) NOT NULL,
  guest_id UUID REFERENCES users(id) NOT NULL,
  booking_id UUID REFERENCES bookings(id) NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(booking_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_listing_id ON reviews(listing_id);
CREATE INDEX IF NOT EXISTS idx_reviews_guest_id ON reviews(guest_id);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews_read" ON reviews;
CREATE POLICY "reviews_read" ON reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS "reviews_insert_own" ON reviews;
CREATE POLICY "reviews_insert_own" ON reviews FOR INSERT WITH CHECK (guest_id::text = current_setting('app.user_id', true));

-- =============================================================================
-- SOFT HOLDS (Capacity-Based Engine)
-- Temporary headcount reservation. Expired holds are periodically swept
-- by the release_expired_holds() function (see below).
-- =============================================================================
CREATE TABLE IF NOT EXISTS soft_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID REFERENCES slots(id) NOT NULL,
  headcount INTEGER NOT NULL CHECK (headcount >= 1),
  booking_id UUID REFERENCES bookings(id) DEFAULT NULL,
  guest_id UUID REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soft_holds_slot_id ON soft_holds(slot_id);
CREATE INDEX IF NOT EXISTS idx_soft_holds_expires ON soft_holds(expires_at);

ALTER TABLE soft_holds ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- PROCESSED WEBHOOKS
-- Idempotency guard for gateway webhooks. Ensures a given transaction ref
-- is only ever processed once.
-- =============================================================================
CREATE TABLE IF NOT EXISTS processed_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_transaction_ref TEXT NOT NULL UNIQUE,
  booking_id UUID REFERENCES bookings(id) DEFAULT NULL,
  gateway TEXT DEFAULT NULL CHECK (gateway IN ('paystack', 'monnify', 'mock')),
  status TEXT DEFAULT 'processed',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE processed_webhooks ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- Since all API requests use the service_role key (bypassed by default),
-- these policies are defensive belts-and-suspenders. They prevent accidental
-- exposure if a client-side key is ever used.
-- =============================================================================

-- Users: can only read/update own record
DROP POLICY IF EXISTS "users_read_own" ON users;
CREATE POLICY "users_read_own" ON users FOR SELECT USING (clerk_id = current_setting('app.clerk_id', true));
DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (clerk_id = current_setting('app.clerk_id', true));

-- Listings: anyone can read active; hosts manage own; admins manage all
DROP POLICY IF EXISTS "listings_read_active" ON listings;
CREATE POLICY "listings_read_active" ON listings FOR SELECT USING (status = 'active');
DROP POLICY IF EXISTS "listings_read_own" ON listings;
CREATE POLICY "listings_read_own" ON listings FOR SELECT USING (host_id::text = current_setting('app.user_id', true));
DROP POLICY IF EXISTS "listings_insert_own" ON listings;
CREATE POLICY "listings_insert_own" ON listings FOR INSERT WITH CHECK (host_id::text = current_setting('app.user_id', true));
DROP POLICY IF EXISTS "listings_update_own" ON listings;
CREATE POLICY "listings_update_own" ON listings FOR UPDATE USING (host_id::text = current_setting('app.user_id', true));

-- Bookings: guest host see own
DROP POLICY IF EXISTS "bookings_read_own" ON bookings;
CREATE POLICY "bookings_read_own" ON bookings FOR SELECT USING (
  guest_id::text = current_setting('app.user_id', true)
  OR listing_id IN (SELECT id FROM listings WHERE host_id::text = current_setting('app.user_id', true))
);
DROP POLICY IF EXISTS "bookings_insert" ON bookings;
CREATE POLICY "bookings_insert" ON bookings FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "bookings_update_own" ON bookings;
CREATE POLICY "bookings_update_own" ON bookings FOR UPDATE USING (guest_id::text = current_setting('app.user_id', true));

-- Slots: readable by all authenticated
DROP POLICY IF EXISTS "slots_read" ON slots;
CREATE POLICY "slots_read" ON slots FOR SELECT USING (true);

-- Exclusive locks: readable by all authenticated
DROP POLICY IF EXISTS "exclusive_locks_read" ON exclusive_locks;
CREATE POLICY "exclusive_locks_read" ON exclusive_locks FOR SELECT USING (true);

-- Soft holds
DROP POLICY IF EXISTS "soft_holds_read" ON soft_holds;
CREATE POLICY "soft_holds_read" ON soft_holds FOR SELECT USING (true);

-- Processed webhooks
DROP POLICY IF EXISTS "webhooks_insert" ON processed_webhooks;
CREATE POLICY "webhooks_insert" ON processed_webhooks FOR INSERT WITH CHECK (true);

-- =============================================================================
-- FUNCTION: search_listings_nearby()
-- Returns active listings within a given radius of a point, ordered by distance.
-- Uses PostGIS ST_DWithin for efficient spatial filtering.
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
  id UUID, host_id UUID, vertical TEXT, sub_vertical TEXT[], booking_type TEXT,
  status TEXT, title TEXT, description TEXT, location JSONB, pricing JSONB,
  operational_rules JSONB, features JSONB, media TEXT[], add_ons JSONB,
  distance_meters DOUBLE PRECISION
)
LANGUAGE sql STABLE
AS $$
  SELECT
    l.id, l.host_id, l.vertical, l.sub_vertical, l.booking_type,
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

-- =============================================================================
-- FUNCTION: reserve_capacity_slot()
-- Atomically increments `booked` on a slot if capacity allows.
-- Returns the updated slot row, or empty if capacity exhausted.
-- =============================================================================
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

-- =============================================================================
-- FUNCTION: resolve_exclusive_lock()
-- Atomically claims an open exclusive lock. On success, marks the winning
-- booking as confirmed and rejects all other pending bookings for the same slot.
-- Returns NULL if someone else already locked it (lost race).
-- =============================================================================
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

-- =============================================================================
-- FUNCTION: release_expired_holds()
-- Sweeps all expired soft holds and releases their headcount back to the slot.
-- Called by a cron job (Vercel Cron / pg_cron) every ~2 minutes.
-- Returns the number of holds released.
-- =============================================================================
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

-- =============================================================================
-- FUNCTION: update_updated_at()
-- Trigger function that auto-sets `updated_at` on row modification.
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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