-- =============================================================================
-- ClockHost Migration — Batch 3: Cancellation, Notifications, Viewings, Contact
-- =============================================================================

BEGIN;

-- =============================================================================
-- CANCELLATION RULES: Per-listing cancellation policies
-- =============================================================================

CREATE TABLE IF NOT EXISTS cancellation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  policy TEXT NOT NULL DEFAULT 'moderate'
    CHECK (policy IN ('flexible', 'moderate', 'strict', 'custom')),
  free_cancellation_hours INTEGER NOT NULL DEFAULT 24
    CHECK (free_cancellation_hours >= 0),
  refund_percentage INTEGER NOT NULL DEFAULT 100
    CHECK (refund_percentage >= 0 AND refund_percentage <= 100),
  host_cancellation_penalty_hours INTEGER NOT NULL DEFAULT 24
    CHECK (host_cancellation_penalty_hours >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(listing_id)
);

CREATE INDEX IF NOT EXISTS idx_cancellation_rules_listing ON cancellation_rules(listing_id);

ALTER TABLE cancellation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cancellation_rules_read_public" ON cancellation_rules;
CREATE POLICY "cancellation_rules_read_public" ON cancellation_rules
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "cancellation_rules_upsert_own" ON cancellation_rules;
CREATE POLICY "cancellation_rules_upsert_own" ON cancellation_rules
  FOR INSERT WITH CHECK (
    listing_id IN (
      SELECT l.id FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE pp.user_id::text = current_setting('app.user_id', true)
    )
  );

DROP POLICY IF EXISTS "cancellation_rules_update_own" ON cancellation_rules;
CREATE POLICY "cancellation_rules_update_own" ON cancellation_rules
  FOR UPDATE USING (
    listing_id IN (
      SELECT l.id FROM listings l
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE pp.user_id::text = current_setting('app.user_id', true)
    )
  );

DROP TRIGGER IF EXISTS cancellation_rules_updated_at ON cancellation_rules;
CREATE TRIGGER cancellation_rules_updated_at
  BEFORE UPDATE ON cancellation_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- REFUND RECORDS: Track every refund issued
-- =============================================================================

CREATE TABLE IF NOT EXISTS refund_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payment_record_id UUID REFERENCES payment_records(id) ON DELETE SET NULL,
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  reason TEXT NOT NULL DEFAULT 'guest_cancelled'
    CHECK (reason IN ('guest_cancelled', 'host_cancelled', 'dispute', 'system_error', 'other')),
  initiated_by UUID REFERENCES users(id),
  gateway_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_records_booking ON refund_records(booking_id);
CREATE INDEX IF NOT EXISTS idx_refund_records_status ON refund_records(status);

ALTER TABLE refund_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "refund_records_read_own" ON refund_records;
CREATE POLICY "refund_records_read_own" ON refund_records
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

DROP TRIGGER IF EXISTS refund_records_updated_at ON refund_records;
CREATE TRIGGER refund_records_updated_at
  BEFORE UPDATE ON refund_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- NOTIFICATIONS: In-app notification system
-- =============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL
    CHECK (type IN ('booking_new', 'booking_approved', 'booking_confirmed', 'booking_cancelled',
                     'payment_received', 'payout_processed',
                     'listing_approved', 'listing_rejected', 'listing_suspended',
                     'verification_approved', 'verification_rejected',
                     'viewing_scheduled', 'viewing_cancelled',
                     'system')),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_read_own" ON notifications;
CREATE POLICY "notifications_read_own" ON notifications
  FOR SELECT USING (user_id::text = current_setting('app.user_id', true));

DROP POLICY IF EXISTS "notifications_insert_service" ON notifications;
CREATE POLICY "notifications_insert_service" ON notifications
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (user_id::text = current_setting('app.user_id', true));

-- =============================================================================
-- VIEWINGS: Pre-booking property viewings for housing
-- =============================================================================

CREATE TABLE IF NOT EXISTS viewings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  guest_note TEXT,
  host_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_viewings_listing ON viewings(listing_id);
CREATE INDEX IF NOT EXISTS idx_viewings_guest ON viewings(guest_id);
CREATE INDEX IF NOT EXISTS idx_viewings_host ON viewings(host_id);
CREATE INDEX IF NOT EXISTS idx_viewings_scheduled ON viewings(scheduled_at);

ALTER TABLE viewings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "viewings_read_own" ON viewings;
CREATE POLICY "viewings_read_own" ON viewings
  FOR SELECT USING (
    guest_id::text = current_setting('app.user_id', true)
    OR host_id::text = current_setting('app.user_id', true)
  );

DROP POLICY IF EXISTS "viewings_insert_guest" ON viewings;
CREATE POLICY "viewings_insert_guest" ON viewings
  FOR INSERT WITH CHECK (
    guest_id::text = current_setting('app.user_id', true)
  );

DROP POLICY IF EXISTS "viewings_update_own" ON viewings;
CREATE POLICY "viewings_update_own" ON viewings
  FOR UPDATE USING (
    guest_id::text = current_setting('app.user_id', true)
    OR host_id::text = current_setting('app.user_id', true)
  );

DROP TRIGGER IF EXISTS viewings_updated_at ON viewings;
CREATE TRIGGER viewings_updated_at
  BEFORE UPDATE ON viewings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- CONTACT ACCESS: Structured host handoff after booking
-- =============================================================================

CREATE TABLE IF NOT EXISTS contact_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  host_phone TEXT,
  host_email TEXT,
  access_code TEXT,
  wifi_network TEXT,
  wifi_password TEXT,
  check_in_instructions TEXT,
  check_out_instructions TEXT,
  parking_info TEXT,
  other_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(booking_id)
);

ALTER TABLE contact_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_access_read_guest" ON contact_access;
CREATE POLICY "contact_access_read_guest" ON contact_access
  FOR SELECT USING (
    booking_id IN (
      SELECT b.id FROM bookings b
      WHERE b.guest_id::text = current_setting('app.user_id', true)
    )
  );

DROP POLICY IF EXISTS "contact_access_insert_host" ON contact_access;
CREATE POLICY "contact_access_insert_host" ON contact_access
  FOR INSERT WITH CHECK (
    booking_id IN (
      SELECT b.id FROM bookings b
      JOIN listings l ON l.id = b.listing_id
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE pp.user_id::text = current_setting('app.user_id', true)
    )
  );

DROP POLICY IF EXISTS "contact_access_update_host" ON contact_access;
CREATE POLICY "contact_access_update_host" ON contact_access
  FOR UPDATE USING (
    booking_id IN (
      SELECT b.id FROM bookings b
      JOIN listings l ON l.id = b.listing_id
      JOIN provider_profiles pp ON pp.id = l.provider_profile_id
      WHERE pp.user_id::text = current_setting('app.user_id', true)
    )
  );

DROP TRIGGER IF EXISTS contact_access_updated_at ON contact_access;
CREATE TRIGGER contact_access_updated_at
  BEFORE UPDATE ON contact_access
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- ADD CANCELLATION POLICY TO BOOKINGS
-- =============================================================================

DO $$ BEGIN
  ALTER TABLE bookings ADD COLUMN cancelled_at TIMESTAMPTZ;
  ALTER TABLE bookings ADD COLUMN cancelled_by UUID REFERENCES users(id);
  ALTER TABLE bookings ADD COLUMN cancel_reason TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

COMMIT;
