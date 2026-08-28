# Migration Phase 2 — Core Product Gaps (Line-by-Line Explanation)

## File: `supabase/migration-phase2.sql`

This migration adds **new features** that were missing from the original design: structured availability rules, configurable pricing, outdoor spaces, and structured descriptions.

---

## Section 1: Opening Transaction

```sql
BEGIN;
```

Same as Phase 1 — starts a transaction so everything is atomic.

---

## Section 2: Availability Rules Table

```sql
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
```

**What it does:** Creates a new table to store when each listing is available for bookings.

**Column-by-column:**

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Unique identifier for each rule |
| `listing_id` | UUID | Which listing this rule belongs to |
| `day_of_week` | SMALLINT | 0=Sunday, 1=Monday, ..., 6=Saturday |
| `start_time` | TIME | When availability starts (e.g., 09:00) |
| `end_time` | TIME | When availability ends (e.g., 17:00) |
| `is_active` | BOOLEAN | Whether this rule is currently active |
| `created_at` | TIMESTAMPTZ | When the rule was created |
| `updated_at` | TIMESTAMPTZ | When the rule was last modified |

**The constraints:**
- `day_of_week BETWEEN 0 AND 6` — Only valid days (0=Sunday through 6=Saturday)
- `CHECK (end_time > start_time)` — End time must be after start time
- `ON DELETE CASCADE` — If the listing is deleted, delete its availability rules too

**Example data:**
```sql
-- A venue open Monday-Friday 9am-5pm
INSERT INTO availability_rules (listing_id, day_of_week, start_time, end_time) VALUES
  ('listing-uuid', 1, '09:00', '17:00'),  -- Monday
  ('listing-uuid', 2, '09:00', '17:00'),  -- Tuesday
  ('listing-uuid', 3, '09:00', '17:00'),  -- Wednesday
  ('listing-uuid', 4, '09:00', '17:00'),  -- Thursday
  ('listing-uuid', 5, '09:00', '17:00');  -- Friday
```

---

## Section 3: Availability Rules Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_availability_rules_listing ON availability_rules(listing_id);
CREATE INDEX IF NOT EXISTS idx_availability_rules_day ON availability_rules(listing_id, day_of_week);
```

**What it does:** Creates two indexes for fast queries:

1. **Single-column index** — Quick lookup by `listing_id` (find all rules for a listing)
2. **Compound index** — Quick lookup by `listing_id` + `day_of_week` (find rules for a specific day)

**Why indexes matter:** Without indexes, the database has to scan EVERY row to find matching rules. With indexes, it can jump directly to the right rows.

---

## Section 4: Availability Rules RLS Policies

```sql
ALTER TABLE availability_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY availability_rules_public_read ON availability_rules
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

**What it does:** Enables Row Level Security and creates 4 policies:

| Policy | Who | What | Condition |
|--------|-----|------|-----------|
| `public_read` | Everyone | SELECT | Always allowed (public data) |
| `owner_insert` | Hosts | INSERT | Only if they own the listing |
| `owner_update` | Hosts | UPDATE | Only if they own the listing |
| `owner_delete` | Hosts | DELETE | Only if they own the listing |

**The ownership check:**
```sql
EXISTS (
  SELECT 1 FROM listings l
  JOIN provider_profiles pp ON pp.id = l.provider_profile_id
  WHERE l.id = listing_id AND pp.user_id = auth.uid()
)
```

This joins `listings` → `provider_profiles` → `auth.users` to verify the current user owns the listing.

---

## Section 5: Pricing Configuration Columns

```sql
ALTER TABLE listings ADD COLUMN IF NOT EXISTS commission_rate_percent NUMERIC(5,2) DEFAULT 5.00;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS exclusive_flat_fee_kobo INTEGER DEFAULT 0;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS multi_guest_discount_percent NUMERIC(5,2) DEFAULT 0.00;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS hourly_discount_tiers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS venue_spend_entitlement JSONB;
```

**What it does:** Adds 5 new columns to the `listings` table for configurable pricing:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `commission_rate_percent` | NUMERIC(5,2) | 5.00 | Platform commission (e.g., 5%) |
| `exclusive_flat_fee_kobo` | INTEGER | 0 | Extra fee for exclusive bookings |
| `multi_guest_discount_percent` | NUMERIC(5,2) | 0 | Discount for large groups |
| `hourly_discount_tiers` | JSONB | `[]` | Discount tiers for long bookings |
| `venue_spend_entitlement` | JSONB | NULL | Discount for returning guests |

**Example values:**
```sql
-- A venue with custom pricing
UPDATE listings SET
  commission_rate_percent = 7.5,        -- 7.5% commission
  exclusive_flat_fee_kobo = 50000,      -- ₦500 flat fee for exclusive
  multi_guest_discount_percent = 10,    -- 10% off for 5+ guests
  hourly_discount_tiers = '[
    {"minHours": 4, "percent": 5},
    {"minHours": 8, "percent": 10},
    {"minHours": 12, "percent": 15}
  ]'::jsonb,
  venue_spend_entitlement = '{
    "thresholdKobo": 500000,
    "discountPercent": 5
  }'::jsonb
WHERE id = 'listing-uuid';
```

**How the tiers work:**
- Book 4+ hours → 5% discount
- Book 8+ hours → 10% discount
- Book 12+ hours → 15% discount

**Venue-spend entitlement:**
- If a guest has spent ≥ ₦5,000 at this venue, they get 5% off future bookings

---

## Section 6: Pricing Snapshot Version

```sql
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pricing_snapshot_version INTEGER DEFAULT 1;
```

**What it does:** Adds a version number to pricing snapshots.

**Why:** If a venue changes their pricing, existing bookings should keep the old price. The version number lets you track which pricing rules were used for each booking.

---

## Section 7: Gateway Fee Tracking

```sql
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS gateway_fee_kobo INTEGER DEFAULT 0;
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS net_amount_kobo INTEGER DEFAULT 0;
```

**What it does:** Adds two columns to track Paystack fees:

| Column | Purpose |
|--------|---------|
| `gateway_fee_kobo` | How much Paystack charged (e.g., 1.5% + ₦100) |
| `net_amount_kobo` | What the platform actually received (amount - fee) |

**Why:** Important for accounting. You need to know how much you're paying in gateway fees.

---

## Section 8: Structured Description

```sql
ALTER TABLE listings ADD COLUMN IF NOT EXISTS structured_description JSONB;
```

**What it does:** Adds a JSONB column for structured listing descriptions.

**Format:**
```json
{
  "highlights": ["Ocean view", "Private pool", "Free parking"],
  "houseRules": ["No smoking indoors", "Quiet hours after 10pm"],
  "idealFor": ["Birthday parties", "Corporate events", "Date nights"],
  "gettingAround": "5 min walk from Lekki Phase 1 bus stop"
}
```

**Why:** Free-form descriptions are hard to search. Structured data lets you:
- Filter by "has parking" or "pet friendly"
- Show highlights in search results
- Create better recommendation algorithms

---

## Section 9: Check-in Token Columns (Duplicate Safety)

```sql
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_in_token TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_in_token_expires_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
```

**Note:** These columns were also added in Phase 1. The `IF NOT EXISTS` clause makes this safe — it won't error if they already exist. This is just a safety net.

---

## Section 10: Updated At Trigger

```sql
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
```

**What it does:** Automatically sets `updated_at` to the current time whenever a row is modified.

**How it works:**
1. `BEFORE UPDATE` — The trigger fires BEFORE the update happens
2. `FOR EACH ROW` — It fires once per row being updated
3. `NEW.updated_at = now()` — Sets the new value
4. `RETURN NEW` — Returns the modified row

**Why:** You always want to know when data was last modified. This automates it so developers don't forget.

---

## Section 11: One Listing Per Provider Trigger

```sql
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
```

**What it does:** Prevents a provider from having more than one non-archived listing.

**How it works:**
1. Fires `BEFORE INSERT OR UPDATE` — Before any listing is created or modified
2. Checks if the new listing's status is NOT 'archived'
3. If so, checks if the provider already has another non-archived listing
4. If they do, raises an exception (blocks the operation)

**Example:**
```sql
-- Provider already has an active listing
INSERT INTO listings (provider_profile_id, status, ...) VALUES
  ('provider-uuid', 'active', ...);
-- ERROR: Provider can only have one active listing.

-- But they can have an archived listing
INSERT INTO listings (provider_profile_id, status, ...) VALUES
  ('provider-uuid', 'archived', ...);
-- OK (archived listings are excluded from the check)
```

**Why:** This is a "defense in depth" strategy. We have:
1. A unique index (Section 4 of Phase 1) — Prevents duplicates at the index level
2. A trigger (this section) — Provides a clear error message
3. Application code — Prevents duplicates in the UI

All three layers work together to ensure data integrity.

---

## Section 12: Closing Transaction

```sql
COMMIT;
```

Same as Phase 1 — saves all changes permanently.

---

## Summary: What Phase 2 Added

| Feature | Table | Columns/Objects |
|---------|-------|-----------------|
| Structured availability | `availability_rules` | New table with day/time rules |
| Configurable pricing | `listings` | 5 new pricing columns |
| Fee tracking | `payment_records` | 2 new columns |
| Structured descriptions | `listings` | 1 JSONB column |
| Auto-update timestamps | `availability_rules` | Trigger |
| One-listing enforcement | `listings` | Trigger |

---

## After Running Both Migrations

Your database now has:

**New tables:**
- `availability_rules` — When each listing is available

**Modified tables:**
- `bookings` — 12 statuses, host_id, idempotency, check-in tokens
- `listings` — Outdoor space, pricing config, structured descriptions
- `payment_records` — Gateway fees, net amounts
- `exclusive_locks` — Expiration, listing reference

**New functions:**
- `convert_hold_to_booking()` — Atomic hold-to-booking conversion
- `create_exclusive_booking()` — Atomic exclusive booking creation
- `cleanup_expired_holds_and_locks()` — Maintenance function

**New triggers:**
- `update_availability_rules_updated_at` — Auto-timestamp
- `enforce_one_listing` — One listing per provider
