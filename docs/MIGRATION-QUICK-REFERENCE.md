# Migration Quick Reference

## Why Two Phases?

### Phase 1: Critical Safety (Run First)

**Purpose:** Fix dangerous bugs that could cause data loss or security issues.

**What it fixes:**
1. Race conditions in booking creation (double-bookings)
2. Missing booking statuses (7 → 12 states)
3. No idempotency (duplicate payments)
4. Missing CSRF on some routes
5. Webhook not verifying with Paystack
6. Exclusive lock errors marking bookings as lost

**Risk level:** HIGH if not run. These are active bugs.

**Run this:** `supabase/migration-phase1.sql`

---

### Phase 2: New Features (Run After Phase 1)

**Purpose:** Add features that were designed but not implemented.

**What it adds:**
1. Structured availability rules (when listings are open)
2. Configurable pricing (discounts, commissions)
3. Outdoor space listing type
4. Structured descriptions (highlights, ideal for, etc.)
5. One-listing-per-provider enforcement
6. Monthly rates and viewing fees

**Risk level:** LOW. These are new features, not bug fixes.

**Run this:** `supabase/migration-phase2.sql`

---

## Order of Operations

```
1. Run Phase 1 SQL
   ↓
2. Verify app works (test bookings, payments)
   ↓
3. Run Phase 2 SQL
   ↓
4. Verify new features (test pricing, availability)
```

---

## What If Something Goes Wrong?

### Before Running
- Take a backup in Supabase Dashboard → Database → Backups
- Test on a development project first

### After Running Phase 1
- If app breaks: The new statuses might conflict with existing code
- Fix: Update the code to handle new statuses, or restore from backup

### After Running Phase 2
- If new features don't work: Check the column types match what the code expects
- Fix: The new columns have safe defaults, so existing data won't break

---

## Common Questions

### Q: Can I run Phase 2 without Phase 1?
**A:** No. Phase 2 depends on Phase 1's changes (especially the status rename).

### Q: Can I run Phase 1 multiple times?
**A:** Yes. All commands use `IF NOT EXISTS` or `IF EXISTS`, so they're idempotent.

### Q: Will this delete my existing data?
**A:** No. We only ADD columns and tables. We never DELETE data.

### Q: How long does it take?
**A:** Usually under 1 minute for both phases combined.

### Q: Do I need to restart my app?
**A:** No. The database changes are immediate. But you should test to make sure everything works.

---

## Verification Checklist

After running Phase 1:
- [ ] Can create a booking
- [ ] Can approve/reject bookings
- [ ] Can cancel bookings
- [ ] Payments work (initiate + webhook)
- [ ] No double-bookings possible

After running Phase 2:
- [ ] Can create listings with `outdoor_space` type
- [ ] Pricing tiers work (multi-guest, hourly)
- [ ] Availability rules can be created
- [ ] Structured descriptions display on listing pages
- [ ] Only one listing per provider enforced
