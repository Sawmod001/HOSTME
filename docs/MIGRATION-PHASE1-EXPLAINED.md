# Migration Phase 1 — Critical Safety (Line-by-Line Explanation)

## File: `supabase/migration-phase1.sql`

This migration fixes **critical safety issues** in the database. It adds missing booking statuses, prevents race conditions, and enforces data integrity rules.

---

## Section 1: Opening Transaction

```sql
BEGIN;
```

**What it does:** Starts a database transaction. All commands after this are treated as one "unit of work." If ANY command fails, PostgreSQL undoes everything that happened after `BEGIN`.

**Why:** Prevents partial migrations. You either get ALL the changes or NONE.

---

## Section 2: Add Missing Booking Statuses

```sql
DO $$ BEGIN
  ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'pending_approval',
    'awaiting_payment',
    'payment_processing',
    'confirmed',
    'checked_in',
    'completed',
    'cancelled_by_guest',
    'cancelled_by_host',
    'cancelled_system',
    'expired',
    'rejected',
    'lost_race'
  ));
```

**What it does:**

1. **Drops the old CHECK constraint** on the `status` column. The old constraint only allowed: `pending`, `awaiting_payment`, `confirmed`, `completed`, `cancelled`, `rejected`, `lost_race`

2. **Creates a new CHECK constraint** that allows 12 statuses instead of 7

**Why these statuses?**

| Status | Who Sets It | When |
|--------|-------------|------|
| `pending_approval` | System | Guest submits booking, waiting for host approval |
| `awaiting_payment` | Host | Host approves, guest needs to pay |
| `payment_processing` | System | Payment is being processed by Paystack |
| `confirmed` | System | Payment confirmed, booking is final |
| `checked_in` | Guest/Host | Guest arrives at the venue |
| `completed` | Host | Event is over, host marks complete |
| `cancelled_by_guest` | Guest | Guest cancels |
| `cancelled_by_host` | Host | Host cancels |
| `cancelled_system` | System | Auto-cancel (e.g., payment timeout) |
| `expired` | System | Booking expired before payment |
| `rejected` | Host | Host rejects the booking request |
| `lost_race` | System | Another guest booked the same slot first |

**The `DO $$ BEGIN ... EXCEPTION WHEN ... END $$;` pattern:**

This is PostgreSQL's way of handling errors gracefully. It says: "Try to drop the constraint. If it doesn't exist, that's fine — just continue."

---

## Section 3: Add host_id Column to Bookings

```sql
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS host_id UUID REFERENCES users(id);
```

**What it does:** Adds a new column `host_id` to the `bookings` table. This column stores the ID of the host (property owner) for quick access.

**Why:** Previously, to find the host for a booking, you had to:
1. Look up the listing from the booking
2. Look up the provider_profile from the listing
3. Look up the user from the provider_profile

That's 3 database queries! With `host_id`, it's just 1 query.

```sql
UPDATE bookings b
SET host_id = pp.user_id
FROM listings l
JOIN provider_profiles pp ON pp.id = l.provider_profile_id
WHERE b.listing_id = l.id
  AND b.host_id IS NULL;
```

**What it does:** Fills in the `host_id` for all existing bookings by joining through listings and provider_profiles.

```sql
ALTER TABLE bookings ALTER COLUMN host_id SET NOT NULL;
```

**What it does:** After backfilling, makes `host_id` required for all new bookings. The `DO $$ BEGIN ... EXCEPTION ... END $$;` wrapper handles the case where there might be orphaned bookings without a listing.

---

## Section 4: One Listing Per Provider

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_listing_per_provider
  ON listings (provider_profile_id)
  WHERE status != 'archived';
```

**What it does:** Creates a database rule that says: "Each provider can only have ONE listing that is NOT archived."

**How it works:** This is a "partial unique index." It only applies to rows where `status != 'archived'`. So a provider can have:
- 1 active listing ✓
- 1 draft listing ✓ (because draft != archived)
- 100 archived listings ✓ (because they're excluded from the rule)

But they CANNOT have:
- 2 active listings ✗ (violates the rule)

**Why:** The design spec says each venue host can only list one space. This enforces it at the database level, not just in code.

---

## Section 5: Exclusive Locks Improvements

```sql
ALTER TABLE exclusive_locks ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE exclusive_locks ADD COLUMN IF NOT EXISTS listing_id UUID REFERENCES listings(id);
ALTER TABLE exclusive_locks ADD COLUMN IF NOT EXISTS event_start TIMESTAMPTZ;
ALTER TABLE exclusive_locks ADD COLUMN IF NOT EXISTS event_end TIMESTAMPTZ;
```

**What it does:** Adds 4 new columns to the `exclusive_locks` table:

| Column | Purpose |
|--------|---------|
| `expires_at` | When the lock automatically expires (for cleanup) |
| `listing_id` | Which listing this lock is for (quick lookup) |
| `event_start` | When the exclusive event starts |
| `event_end` | When the exclusive event ends |

**Why:** Previously, exclusive locks didn't have expiration times, so expired locks could stay in the database forever, blocking new bookings.

---

## Section 6: Payment Records Status Update

```sql
DO $$ BEGIN
  ALTER TABLE payment_records DROP CONSTRAINT IF EXISTS payment_records_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE payment_records ADD CONSTRAINT payment_records_status_check
  CHECK (status IN ('pending', 'processing', 'successful', 'failed', 'refunded', 'disputed'));
```

**What it does:** Updates the allowed payment statuses to include `processing` (for when Paystack is processing the payment).

---

## Section 7: Idempotency Key

```sql
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
```

**What it does:** Adds a column for idempotency keys. An idempotency key is a unique string that prevents the same booking from being created twice.

**How it works:**
1. Client generates a unique key (e.g., `abc-123-def-456`)
2. Client sends booking request with this key
3. Server checks: "Have I seen this key before?"
4. If YES: Return the existing booking (don't create a duplicate)
5. If NO: Create the booking and store the key

**Why:** Prevents double-bookings when:
- User clicks "Submit" twice quickly
- Network timeout causes user to retry
- Webhook is received twice from Paystack

---

## Section 8: Check-in Tokens

```sql
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_in_token TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_in_token_expires_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
```

**What it does:** Adds columns for a check-in verification system:

| Column | Purpose |
|--------|---------|
| `check_in_token` | A secret code the guest shows at the door |
| `check_in_token_expires_at` | When the token stops working |
| `checked_in_at` | When the guest actually checked in |

**Why:** For venue bookings, the host needs to verify the guest actually arrived. The system generates a token, the guest shows it, the host verifies it.

---

## Section 9: Listing Status Rename

```sql
UPDATE listings SET status = 'under_review' WHERE status = 'pending_review';

DO $$ BEGIN
  ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE listings ADD CONSTRAINT listings_status_check
  CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'suspended', 'archived'));

UPDATE listings SET status = 'submitted' WHERE status = 'pending_review';
```

**What it does:** Renames listing statuses to match the design spec:

| Old Status | New Status | Meaning |
|------------|------------|---------|
| `pending_review` | `submitted` | Host submitted for review |
| — | `under_review` | Admin is reviewing |
| — | `approved` | Admin approved (replaces `active` for submitted listings) |

**Why:** The old status `pending_review` was confusing. The new flow is:
1. `draft` — Host is still editing
2. `submitted` — Host clicked "Submit for Review"
3. `under_review` — Admin opened the review page
4. `approved` / `rejected` — Admin made a decision
5. `active` — Listing is live (after approval)
6. `suspended` — Temporarily removed
7. `archived` — Permanently removed

---

## Section 10: Atomic Booking Creation Function

```sql
CREATE OR REPLACE FUNCTION convert_hold_to_booking(...)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
...
$$;
```

**What it does:** Creates a PostgreSQL function that atomically converts a soft hold into a booking. "Atomically" means it either succeeds completely or fails completely — no partial states.

**Step-by-step:**

1. **Lock the soft hold row** — `SELECT ... FOR UPDATE` prevents other transactions from reading/modifying this row while we work with it

2. **Validate the hold** — Check it exists, is active, hasn't expired, belongs to the guest, headcount is valid

3. **Check idempotency** — If the key was used before, return the existing booking

4. **Create the booking** — Insert into `bookings` table with all the right fields

5. **Mark hold as released** — Update `soft_holds` to show it was converted

6. **Update slot capacity** — Increment `booked` count on the slot

7. **Log the transition** — Record the status change in `booking_transitions`

**Why this is critical:** Without this function, the old code had a race condition:
1. Guest A checks capacity → OK
2. Guest B checks capacity → OK (same slot!)
3. Guest A books → succeeds
4. Guest B books → also succeeds (DOUBLE BOOKING!)

With this function, steps 1-4 happen in a single atomic operation. Only one guest can succeed.

---

## Section 11: Atomic Exclusive Lock Function

```sql
CREATE OR REPLACE FUNCTION create_exclusive_booking(...)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
...
$$;
```

**What it does:** Similar to `convert_hold_to_booking` but for exclusive bookings. It:

1. Checks idempotency
2. Checks for conflicting exclusive bookings (using PostgreSQL's range overlap operator `&&`)
3. Creates the booking
4. Creates the exclusive lock
5. Logs the transition

**The range overlap check:**
```sql
AND tstzrange(start_date + COALESCE(start_time, '00:00'::time), end_date + COALESCE(end_time, '23:59'::time)) &&
    tstzrange(p_event_start, p_event_end)
```

This uses PostgreSQL's built-in range types to check if two time ranges overlap. The `&&` operator means "overlaps with."

---

## Section 12: Cleanup Function

```sql
CREATE OR REPLACE FUNCTION cleanup_expired_holds_and_locks()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
...
$$;
```

**What it does:** A maintenance function that cleans up expired data:

1. Releases expired soft holds (sets `state = 'released'`)
2. Expires old exclusive locks (sets `status = 'expired'`)
3. Cancels bookings that expired while awaiting payment

**How to use:** Call this periodically (e.g., every 5 minutes) from a cron job or the app:
```sql
SELECT cleanup_expired_holds_and_locks();
```

---

## Section 13: WhatsApp Sessions RLS

```sql
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY whatsapp_sessions_admin_read ON whatsapp_sessions
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

**What it does:** Enables Row Level Security (RLS) on the `whatsapp_sessions` table and creates policies:

- **admin_read** — Only admins can read WhatsApp sessions
- **service_insert** — The app can insert new sessions
- **service_update** — The app can update existing sessions

**Why:** WhatsApp sessions contain sensitive data (phone numbers, conversation history). Only admins should be able to view them.

---

## Section 14: Closing Transaction

```sql
COMMIT;
```

**What it does:** Saves all changes to the database. If you got here without errors, everything is applied permanently.

**If you see an error before this:** Nothing was saved. The database is exactly as it was before you ran the migration.
