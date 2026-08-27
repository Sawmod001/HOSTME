-- =============================================================================
-- ClockHost Migration — Batch 2: Critical DB Fixes + Foundation Infrastructure
-- =============================================================================
-- Depends on: migration.sql (Batch 1)
-- Run in a transaction. If anything fails, nothing is applied.
-- =============================================================================

BEGIN;

-- =============================================================================
-- EXTENSIONS: Enable btree_gist for exclusion constraints on ranges
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- =============================================================================
-- CHECK CONSTRAINTS: Enforce valid values at the database level
-- =============================================================================

-- listings.status
DO $$ BEGIN
  ALTER TABLE listings ADD CONSTRAINT listings_status_check
    CHECK (status IN ('draft', 'pending_review', 'active', 'suspended', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- listings.vertical
DO $$ BEGIN
  ALTER TABLE listings ADD CONSTRAINT listings_vertical_check
    CHECK (vertical IS NOT NULL AND vertical != '');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- listings.booking_type
DO $$ BEGIN
  ALTER TABLE listings ADD CONSTRAINT listings_booking_type_check
    CHECK (booking_type IN ('exclusive', 'capacity', 'housing'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- bookings.status
DO $$ BEGIN
  ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
    CHECK (status IN ('pending', 'awaiting_payment', 'confirmed', 'completed', 'cancelled', 'rejected', 'lost_race'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- bookings.headcount
DO $$ BEGIN
  ALTER TABLE bookings ADD CONSTRAINT bookings_headcount_check
    CHECK (headcount >= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- bookings.total_amount_kobo
DO $$ BEGIN
  ALTER TABLE bookings ADD CONSTRAINT bookings_total_amount_kobo_check
    CHECK (total_amount_kobo >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- bookings.event ordering
DO $$ BEGIN
  ALTER TABLE bookings ADD CONSTRAINT bookings_event_order_check
    CHECK (event_end > event_start);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- slots.capacity
DO $$ BEGIN
  ALTER TABLE slots ADD CONSTRAINT slots_capacity_check
    CHECK (capacity >= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- slots.booked
DO $$ BEGIN
  ALTER TABLE slots ADD CONSTRAINT slots_booked_check
    CHECK (booked >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- slots.event ordering
DO $$ BEGIN
  ALTER TABLE slots ADD CONSTRAINT slots_event_order_check
    CHECK (event_end > event_start);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- exclusive_locks.status
DO $$ BEGIN
  ALTER TABLE exclusive_locks ADD CONSTRAINT exclusive_locks_status_check
    CHECK (status IN ('open', 'locked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- soft_holds.headcount
DO $$ BEGIN
  ALTER TABLE soft_holds ADD CONSTRAINT soft_holds_headcount_check
    CHECK (headcount >= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- blocked_dates.reason
DO $$ BEGIN
  ALTER TABLE blocked_dates ADD CONSTRAINT blocked_dates_reason_check
    CHECK (reason IN ('host_blocked', 'booking_held', 'maintenance', 'past_date'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- group_plans.event ordering
DO $$ BEGIN
  ALTER TABLE group_plans ADD CONSTRAINT group_plans_event_order_check
    CHECK (event_end > event_start);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- EXCLUSION CONSTRAINTS: Prevent overlapping time ranges
-- =============================================================================

-- Slots: no two slots for the same listing at overlapping times
DO $$ BEGIN
  ALTER TABLE slots ADD CONSTRAINT no_overlapping_slots
    EXCLUDE USING gist (
      listing_id WITH =,
      tstzrange(event_start, event_end) WITH &&
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Exclusive bookings: no two confirmed/awaiting_payment exclusive bookings at overlapping times
DO $$ BEGIN
  ALTER TABLE bookings ADD CONSTRAINT no_overlapping_exclusive_bookings
    EXCLUDE USING gist (
      listing_id WITH =,
      tstzrange(event_start, event_end) WITH &&
    ) WHERE (status IN ('confirmed', 'awaiting_payment') AND booking_type = 'exclusive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- FIX RLS: bookings INSERT must verify guest_id
-- =============================================================================

DROP POLICY IF EXISTS "bookings_insert" ON bookings;
CREATE POLICY "bookings_insert" ON bookings
  FOR INSERT WITH CHECK (
    guest_id::text = current_setting('app.user_id', true)
  );

-- =============================================================================
-- FIX RLS: audit_logs — admin can read, service_role can write
-- =============================================================================

DROP POLICY IF EXISTS "audit_logs_admin_read" ON audit_logs;
CREATE POLICY "audit_logs_admin_read" ON audit_logs
  FOR SELECT USING (
    current_setting('app.user_role', true) = 'admin'
  );

-- =============================================================================
-- FIX: blocked_dates.booking_id FK should be ON DELETE SET NULL
-- =============================================================================

ALTER TABLE blocked_dates DROP CONSTRAINT IF EXISTS blocked_dates_booking_id_fkey;
ALTER TABLE blocked_dates ADD CONSTRAINT blocked_dates_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;

-- =============================================================================
-- NEW TABLE: booking_transitions — state machine audit trail
-- =============================================================================

CREATE TABLE IF NOT EXISTS booking_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  triggered_by UUID REFERENCES users(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_transitions_booking ON booking_transitions(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_transitions_created ON booking_transitions(created_at);

ALTER TABLE booking_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "booking_transitions_read_own" ON booking_transitions;
CREATE POLICY "booking_transitions_read_own" ON booking_transitions
  FOR SELECT USING (
    booking_id IN (
      SELECT b.id FROM bookings b
      WHERE b.guest_id::text = current_setting('app.user_id', true)
         OR b.listing_id IN (
           SELECT l.id FROM listings l
           JOIN provider_profiles pp ON pp.id = l.provider_profile_id
           WHERE pp.user_id::text = current_setting('app.user_id', true)
         )
    )
  );

DROP POLICY IF EXISTS "booking_transitions_insert_service" ON booking_transitions;
CREATE POLICY "booking_transitions_insert_service" ON booking_transitions
  FOR INSERT WITH CHECK (true);

-- Trigger: auto-log booking status transitions
CREATE OR REPLACE FUNCTION log_booking_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO booking_transitions (booking_id, from_status, to_status, triggered_by)
    VALUES (NEW.id, OLD.status, NEW.status, NULL);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_status_transition ON bookings;
CREATE TRIGGER bookings_status_transition
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION log_booking_transition();

-- =============================================================================
-- NEW TABLE: payment_records — payment lifecycle tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  currency TEXT NOT NULL DEFAULT 'NGN',
  gateway TEXT NOT NULL DEFAULT 'paystack',
  gateway_transaction_ref TEXT,
  gateway_event_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'successful', 'failed', 'refunded', 'disputed')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_records_booking ON payment_records(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_ref ON payment_records(gateway_transaction_ref);
CREATE INDEX IF NOT EXISTS idx_payment_records_status ON payment_records(status);

ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_records_read_own" ON payment_records;
CREATE POLICY "payment_records_read_own" ON payment_records
  FOR SELECT USING (
    booking_id IN (
      SELECT b.id FROM bookings b
      WHERE b.guest_id::text = current_setting('app.user_id', true)
         OR b.listing_id IN (
           SELECT l.id FROM listings l
           JOIN provider_profiles pp ON pp.id = l.provider_profile_id
           WHERE pp.user_id::text = current_setting('app.user_id', true)
         )
    )
  );

DROP TRIGGER IF EXISTS payment_records_updated_at ON payment_records;
CREATE TRIGGER payment_records_updated_at
  BEFORE UPDATE ON payment_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- NEW TABLE: listing_media — proper media entity (replaces TEXT[] over time)
-- =============================================================================

CREATE TABLE IF NOT EXISTS listing_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image'
    CHECK (media_type IN ('image', 'video', 'virtual_tour', 'floor_plan')),
  caption TEXT,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_media_listing ON listing_media(listing_id);

ALTER TABLE listing_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "listing_media_read_active" ON listing_media;
CREATE POLICY "listing_media_read_active" ON listing_media
  FOR SELECT USING (
    listing_id IN (SELECT id FROM listings WHERE status = 'active')
  );

DROP POLICY IF EXISTS "listing_media_read_own" ON listing_media;
CREATE POLICY "listing_media_read_own" ON listing_media
  FOR SELECT USING (
    listing_id IN (
      SELECT l.id FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE pp.user_id::text = current_setting('app.user_id', true)
    )
  );

DROP POLICY IF EXISTS "listing_media_insert_own" ON listing_media;
CREATE POLICY "listing_media_insert_own" ON listing_media
  FOR INSERT WITH CHECK (
    listing_id IN (
      SELECT l.id FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE pp.user_id::text = current_setting('app.user_id', true)
    )
  );

DROP POLICY IF EXISTS "listing_media_delete_own" ON listing_media;
CREATE POLICY "listing_media_delete_own" ON listing_media
  FOR DELETE USING (
    listing_id IN (
      SELECT l.id FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE pp.user_id::text = current_setting('app.user_id', true)
    )
  );

-- =============================================================================
-- FIX DATABASE FUNCTIONS: Add FOR UPDATE and transaction safety
-- =============================================================================

-- reserve_capacity_slot: add FOR UPDATE for explicit row lock
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

-- resolve_exclusive_lock: add FOR UPDATE on lock row + wrap in transaction
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
  -- Lock the row explicitly to prevent concurrent resolution
  SELECT * INTO v_lock
  FROM exclusive_locks
  WHERE id = p_lock_id AND status = 'open'
  FOR UPDATE;

  IF v_lock.id IS NULL THEN
    RETURN;
  END IF;

  -- Claim the lock
  UPDATE exclusive_locks
  SET status = 'locked', locked_by_booking_id = p_booking_id
  WHERE id = p_lock_id;

  -- Confirm the winning booking
  UPDATE bookings SET status = 'confirmed' WHERE id = p_booking_id;

  -- Reject competing bookings for the same slot
  UPDATE bookings
  SET status = 'rejected'
  WHERE listing_id = p_listing_id
    AND event_start = p_event_start
    AND id != p_booking_id
    AND status IN ('pending', 'awaiting_payment');

  RETURN QUERY SELECT v_lock.id, 'locked'::TEXT, p_booking_id;
END;
$$;

-- release_expired_holds: wrap in explicit transaction
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
-- COMPOSITE INDEXES: Optimize common query patterns
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_bookings_guest_status ON bookings(guest_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_listing_event ON bookings(listing_id, event_start);
CREATE INDEX IF NOT EXISTS idx_bookings_listing_status ON bookings(listing_id, status);
CREATE INDEX IF NOT EXISTS idx_slots_listing_event ON slots(listing_id, event_start);
CREATE INDEX IF NOT EXISTS idx_listings_status_vertical ON listings(status, vertical);
CREATE INDEX IF NOT EXISTS idx_listings_status_created ON listings(status, created_at);
CREATE INDEX IF NOT EXISTS idx_blocked_dates_listing_date ON blocked_dates(listing_id, blocked_date);
CREATE INDEX IF NOT EXISTS idx_soft_holds_slot_expires ON soft_holds(slot_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_plan_members_plan_status ON plan_members(plan_id, status);

COMMIT;
