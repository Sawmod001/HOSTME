-- =============================================================================
-- ClockHost Phase 2: Core Product Gaps — Database Migration
-- =============================================================================
-- Run in a transaction. If anything fails, nothing is applied.
-- Depends on: migration-phase1.sql
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. AVAILABILITY_RULES: Structured recurring schedule (§21)
-- =============================================================================

CREATE TABLE IF NOT EXISTS availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_availability_rules_listing ON availability_rules(listing_id);
CREATE INDEX IF NOT EXISTS idx_availability_rules_day ON availability_rules(listing_id, day_of_week);

-- RLS
ALTER TABLE availability_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY availability_rules_public_read ON availability_rules
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY availability_rules_owner_insert ON availability_rules
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM listings l
        JOIN provider_profiles pp ON pp.id = l.provider_profile_id
        WHERE l.id = listing_id AND pp.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY availability_rules_owner_update ON availability_rules
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM listings l
        JOIN provider_profiles pp ON pp.id = l.provider_profile_id
        WHERE l.id = listing_id AND pp.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY availability_rules_owner_delete ON availability_rules
    FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM listings l
        JOIN provider_profiles pp ON pp.id = l.provider_profile_id
        WHERE l.id = listing_id AND pp.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 2. PRICING_CONFIG: Configurable commission rates per listing (§32, §42)
-- =============================================================================

ALTER TABLE listings ADD COLUMN IF NOT EXISTS commission_rate_percent NUMERIC(5,2) DEFAULT 5.00;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS exclusive_flat_fee_kobo INTEGER DEFAULT 0;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS multi_guest_discount_percent NUMERIC(5,2) DEFAULT 0.00;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS hourly_discount_tiers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS venue_spend_entitlement JSONB;

-- =============================================================================
-- 3. BOOKINGS: Add pricing snapshot version for audit trail
-- =============================================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pricing_snapshot_version INTEGER DEFAULT 1;

-- =============================================================================
-- 4. PAYSTACK_FEES: Track gateway fees on payment records
-- =============================================================================

ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS gateway_fee_kobo INTEGER DEFAULT 0;
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS net_amount_kobo INTEGER DEFAULT 0;

-- =============================================================================
-- 5. LISTINGS: Add 'outdoor_space' to listing verticals
-- =============================================================================

-- The vertical is stored as TEXT, not enum, so we just need to update CHECK
-- constraints if any. The existing code uses TEXT for vertical.

-- =============================================================================
-- 6. LISTINGS: Add structured description fields
-- =============================================================================

ALTER TABLE listings ADD COLUMN IF NOT EXISTS structured_description JSONB;
-- Format: { highlights: [...], houseRules: [...], ideal_for: [...], getting_around: [...] }

-- =============================================================================
-- 7. BOOKINGS: Check-in token for guest verification
-- =============================================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_in_token TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_in_token_expires_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

-- =============================================================================
-- 8. TRIGGER: Auto-update updated_at on availability_rules
-- =============================================================================

CREATE OR REPLACE FUNCTION update_availability_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS availability_rules_updated_at ON availability_rules;
CREATE TRIGGER availability_rules_updated_at
  BEFORE UPDATE ON availability_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_availability_rules_updated_at();

-- =============================================================================
-- 9. TRIGGER: Prevent multiple non-archived listings per provider
-- =============================================================================

CREATE OR REPLACE FUNCTION enforce_one_listing_per_provider()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status != 'archived' THEN
    IF EXISTS (
      SELECT 1 FROM listings
      WHERE provider_profile_id = NEW.provider_profile_id
        AND status != 'archived'
        AND id != NEW.id
    ) THEN
      RAISE EXCEPTION 'Provider can only have one active listing. Archive or delete the existing listing first.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_one_listing ON listings;
CREATE TRIGGER enforce_one_listing
  BEFORE INSERT OR UPDATE ON listings
  FOR EACH ROW
  EXECUTE FUNCTION enforce_one_listing_per_provider();

COMMIT;
