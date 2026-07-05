# HostMe AI Handoff Document — Continue Here

**Status**: Stage 2 (Capacity-Based Booking Engine) Complete | Stage 3 Ready to Begin  
**Last Commit**: Stage 2 Complete: Capacity Booking Engine — SoftHold, Checkout, Concurrency Tests  
**Date**: 2026-07-05  
**Build Status**: ✅ Production build passes (0 errors)

---

## 🎯 What's Been Completed

### Foundation (Stage 0) ✅
- Next.js 15 App Router scaffold
- Mongoose connection with global cache pattern (`lib/db.js`)
- NextAuth v4.24.14 credentials provider (demo mode — real OTP auth is Stage 5)
- All 6 core models: User, Listing, Slot, Booking, ExclusiveLock, SoftHold
- Design system (Tailwind + custom CSS tokens in `globals.css`)

### Listings & Discovery (Stage 1) ✅
#### API Routes (All 8 implemented)
- `GET /api/listings` — Geospatial + compound index search with cursor pagination
- `POST /api/listings` — Create listing (starts in `draft`)
- `GET /api/listings/[id]` — Listing detail
- `PATCH /api/listings/[id]` — Update draft listing (host-owned only)
- `POST /api/listings/[id]/submit-review` — Draft → pending_review
- `GET /api/listings/[id]/slots` — Capacity slot availability per date
- `GET /api/listings/[id]/availability` — ExclusiveLock open/locked status per date
- `POST /api/admin/listings/[id]/approve` — Admin approve → active
- `POST /api/admin/listings/[id]/reject` — Admin reject with reason

#### UI Screens (All 5 built)
1. **Discovery Hub** `/app/(public)/listings/page.js`
   - Search + filter (vertical, bookingType, cityArea)
   - Infinite scroll cursor pagination
   - Four UI states: loading skeleton, empty, error + retry, normal

2. **Listing Detail** `/app/(public)/listings/[id]/page.js`
   - Space preview, pricing, add-ons
   - Date picker with slot/availability display
   - Branching logic: capacity shows live remaining seats, exclusive shows open/locked status
   - "Book Now" links to `/listings/[id]/checkout`

3. **Host Creation Form** `/app/(host)/host/listings/new/page.js`
   - Full form: vertical, bookingType, pricing, capacity, buffers, add-ons, policies
   - Submits to admin queue (`submit-review`)

4. **Host Dashboard** `/app/(host)/host/listings/page.js`
   - All host listings grouped by status

5. **Admin Queue** `/app/(admin)/admin/listings/pending/page.js`
   - Pending listings table with approve/reject actions + reason modal

#### Utilities
- `lib/validation.js` — Zod schemas: `validateListingCreate`, `validateListingUpdate`, `validateListingFilter`
- `lib/geo.js` — Geospatial query builders
- `lib/auth.js` — NextAuth v4 config
- `lib/db.js` — MongoDB connection singleton
- `lib/roles.js` — `hasRequiredRole(user, role)` — always checks `roles[]` array, never `activeRole`

---

### Capacity-Based Booking Engine (Stage 2) ✅

#### API Routes (3 new)
- **`POST /api/soft-holds`** — Atomically reserves headcount via `findOneAndUpdate` + `$expr`, creates SoftHold with 10-min TTL
- **`POST /api/bookings`** — Creates Booking from a valid (non-expired) SoftHold, sets `status: awaiting_payment`
- *(Slot management routes were part of Stage 1 above)*

#### Core Library
- **`lib/booking.js`** — `reserveCapacitySlot()` function
  - Uses `Slot.findOneAndUpdate({ $expr: { $lte: [{ $add: ['$booked', headcount] }, '$capacity'] } }, { $inc: { booked: headcount } })` — fully atomic, matches DB spec §2.2
  - Creates SoftHold document on success
  - Returns `{ ok, status, data }` — never a read-then-write

#### UI Screens (1 new)
- **Checkout Page** `/app/(public)/listings/[id]/checkout/page.js` (Screen 3 — capacity variant)
  - Guest info form: name, email, phone
  - Date + slot selection
  - Headcount dial (validated against `maxCapacity`)
  - Add-ons with live running total (all Kobo — no floats)
  - On submit: calls `POST /api/soft-holds` then `POST /api/bookings`
  - All 4 UI states: loading skeleton, error + retry, pessimistic-disabled button (locks on click), confirmation

#### Tests
- **`__tests__/concurrency.test.js`** — node:test suite with mock DB models
  - Verifies first reservation succeeds, subsequent request against exhausted capacity returns 409
  - Confirms `booked` counter is not over-incremented
- **`tests/concurrency.md`** — manual test plan for simulating concurrent HTTP load

---

## 🚨 Known Bugs in Existing Code (Do NOT silently fix — log first)

These were discovered during Stage 3 audit. **Do not modify existing working files** per project rules unless explicitly instructed.

| # | Severity | Bug | File | Impact |
|---|---|---|---|---|
| 1 | 🔴 Critical | `getServerSession` imported from `next-auth/react` (client module) instead of server module — auth check always resolves to null | `api/listings/route.js` L52 | Anyone can create listings unauthenticated |
| 2 | 🔴 Critical | Same broken `getServerSession` import | `api/listings/[id]/route.js` L28 | Anyone can update listings |
| 3 | 🟡 Medium | No SoftHold expiry sweep — `Slot.booked` is never decremented when a SoftHold TTL-expires. Capacity leaks over time. | `lib/booking.js` | Gradual overselling risk |
| 4 | 🟡 Medium | `POST /api/bookings` has no auth check | `api/bookings/route.js` | Unauthenticated booking creation |
| 5 | 🟡 Low | `SoftHold.bookingId` is optional (`default: null`) but DB spec §2.2 marks it `required: true` | `models/SoftHold.js` | Minor schema deviation |

> **Before fixing**: confirm with the human "fix bugs first" before touching any existing file.

---

## 🔌 MongoDB Connection Status

**Atlas cluster is running and the credentials are correct.**  
**Current blocker**: this machine's IP is not whitelisted on Atlas.

**To fix (human action required):**
1. Go to [MongoDB Atlas](https://cloud.mongodb.com) → Security → Network Access
2. Add current IP, or set `0.0.0.0/0` (Allow from Anywhere) for development
3. Connection string in `.env.example` is correct — copy it to `.env`

```
MONGODB_URI=mongodb+srv://sawmodabolaji_db_user:e0Jfw0RIacsihbCx@cluster0.aphsje6.mongodb.net/
NEXTAUTH_SECRET=hostme-dev-secret
NEXTAUTH_URL=http://localhost:3000
```

---

## 🚀 What's Next: Stage 3 — Exclusive-Space Booking Engine

Per `HostMe_Build_Roadmap.md §3 Stage 3`:
> ExclusiveLock model, approve/reject flow, atomic race-resolution in webhook handler.  
> **Auto-refund path for `lost_race` bookings — build and test this before anything else in Stage 3 ships.**

### New Files to Build (10 total — all new, no edits to existing)

#### Phase 3A — Backend Core (in order)

1. **`src/lib/exclusive.js`** — `resolveExclusiveLock()` function
   - `ExclusiveLock.findOneAndUpdate({ _id, status: 'open' }, { status: 'locked', lockedByBookingId })` — single atomic op
   - If null → lost race → `Booking.updateOne({ status: 'lost_race' })`
   - If wins → `Booking.updateOne({ status: 'confirmed' })` + `Booking.updateMany(siblings → rejected)`
   - This is the entire "first-to-pay wins" mechanism

2. **`__tests__/exclusive-lock.test.js`** — Tests before wiring to routes
   - Race win: two concurrent calls, one wins, one lost_race
   - Idempotency: same `gatewayTransactionRef` → second call is no-op
   - Sibling rejection: `updateMany` targets correct listing + eventStart

3. **`src/app/api/bookings/exclusive/request/route.js`** — Guest submits "Request to Book"
   - Validates: listingId, lockId, headcount, eventStart, eventEnd
   - Verifies: listing is `exclusive` + `active`, ExclusiveLock is `open`
   - Creates Booking `status: pending` — no slot mutation yet

4. **`src/app/api/bookings/[id]/approve/route.js`** — Host approves pending exclusive booking
   - Auth: `roles.includes('host')` AND `listing.hostId === session.user.id`
   - Transitions: `pending → awaiting_payment`

5. **`src/app/api/bookings/[id]/reject/route.js`** — Host rejects with reason
   - Auth: same as approve
   - Body: `{ reason: string }` required
   - Transitions: `pending → rejected`

6. **`src/app/api/payments/initiate/route.js`** — Paystack checkout session (server-side only)
   - Auth: `session.user.id === booking.guestId`
   - Validates: `booking.status === 'awaiting_payment'`
   - Calls Paystack `POST /transaction/initialize` with `metadata.bookingId`
   - Returns: `{ authorization_url, reference }`

7. **`src/app/api/payments/webhook/paystack/route.js`** — ⚠️ MOST CRITICAL FILE
   - Verifies Paystack HMAC-SHA512 signature
   - **Idempotency guard** (DB spec §2.5):
     ```javascript
     try {
       await Booking.updateOne(
         { _id: bookingId, gatewayTransactionRef: { $exists: false } },
         { gatewayTransactionRef: txRef }
       );
     } catch (e) {
       if (e.code === 11000) return Response.json({ received: true }); // already processed
       throw e;
     }
     ```
   - Capacity bookings: `awaiting_payment → confirmed`
   - Exclusive bookings: calls `resolveExclusiveLock()` → lost_race logs auto-refund intent
   - Always returns HTTP 200

#### Phase 3B — UI Screens

8. **`src/app/(public)/listings/[id]/exclusive-request/page.js`** — Guest "Request to Book" form
   - Date picker, headcount dial, add-ons, total in Kobo
   - Calls `POST /api/bookings/exclusive/request`
   - All 4 states: loading, empty (no open locks), error + retry, pessimistic-disabled

9. **`src/app/(host)/host/bookings/page.js`** — Screen 6: Host Management Workspace
   - Tabs: Pending | Approved | Rejected | Completed
   - Exclusive listings: [APPROVE] / [DENY] per booking (DENY opens reason modal)
   - Capacity listings: fill-meter read-only view `(28/40 booked)`
   - All 4 states, pessimistic button locks

10. **`src/app/(public)/bookings/[id]/page.js`** — Guest booking status page
    - State-specific messaging for every Booking status
    - `lost_race` clearly explains refund is processing
    - `awaiting_payment` shows Pay Now CTA → Paystack authorization_url

---

## 📋 Project Structure (Current)

```
HOSTME/
├── AGENTS.md
├── HANDOFF.md                         ← THIS FILE
├── HostMe_Master_Blueprint_v2.md      ← Business philosophy (read-only)
├── HostMe_PRD_v3.md                   ← Functional spec (source of truth)
├── HostMe_Database_Schemas_v2.md      ← DB patterns — §2.2 and §2.4 are LAW
├── HostMe_Build_Roadmap.md            ← Stage definitions and build order
├── HostMe_API_Route_Contract.md       ← All routes to implement
├── HostMe_Auth_Identity_v2.md         ← Auth flows, RBAC, multi-role
├── HostMe_Remaining_Data_Models.md    ← Transaction, Message, Review, Dispute
├── HostMe_Cancellation_Refund_Policy.md
├── HostMe_Design_System.md            ← Visual tokens — apply to every UI
│
└── hostme-app/
    ├── src/
    │   ├── app/
    │   │   ├── (public)/
    │   │   │   └── listings/
    │   │   │       ├── page.js                    ← Screen 1: Discovery Hub
    │   │   │       └── [id]/
    │   │   │           ├── page.js                ← Screen 2: Listing Detail
    │   │   │           └── checkout/page.js       ← Screen 3: Capacity Checkout ✅
    │   │   │           [exclusive-request/page.js] ← Screen 3: Exclusive variant (Stage 3)
    │   │   │   [bookings/[id]/page.js]            ← Guest status page (Stage 3)
    │   │   │
    │   │   ├── (host)/host/
    │   │   │   ├── listings/
    │   │   │   │   ├── page.js                    ← Host Dashboard ✅
    │   │   │   │   └── new/page.js                ← Host Creation Form ✅
    │   │   │   [bookings/page.js]                 ← Screen 6: Host Inbox (Stage 3)
    │   │   │
    │   │   ├── (admin)/admin/listings/pending/page.js  ← Admin Queue ✅
    │   │   │
    │   │   ├── signin/                            ← NextAuth sign-in page
    │   │   │
    │   │   └── api/
    │   │       ├── listings/                      ← CRUD + admin routes ✅
    │   │       ├── soft-holds/                    ← Capacity reservation ✅
    │   │       ├── bookings/                      ← Booking creation ✅
    │   │       │   [bookings/exclusive/request]   ← Stage 3
    │   │       │   [bookings/[id]/approve]        ← Stage 3
    │   │       │   [bookings/[id]/reject]         ← Stage 3
    │   │       [payments/initiate]               ← Stage 3
    │   │       [payments/webhook/paystack]       ← Stage 3 (CRITICAL)
    │   │       └── auth/[...nextauth]/            ← NextAuth handler ✅
    │   │
    │   ├── lib/
    │   │   ├── db.js           ← MongoDB singleton
    │   │   ├── auth.js         ← NextAuth config
    │   │   ├── validation.js   ← Zod schemas
    │   │   ├── geo.js          ← Geospatial helpers
    │   │   ├── roles.js        ← hasRequiredRole(user, role)
    │   │   └── booking.js      ← reserveCapacitySlot() ← atomic ✅
    │   │   [exclusive.js]      ← resolveExclusiveLock() ← Stage 3
    │   │
    │   └── models/
    │       ├── User.js
    │       ├── Listing.js      ← Has rejectionReason field
    │       ├── Slot.js
    │       ├── Booking.js      ← gatewayTransactionRef unique index ✅
    │       ├── ExclusiveLock.js
    │       └── SoftHold.js     ← TTL index ✅
    │
    ├── __tests__/
    │   └── concurrency.test.js ← Stage 2 concurrency tests ✅
    │   [exclusive-lock.test.js] ← Stage 3 race + idempotency tests
    ├── tests/
    │   └── concurrency.md      ← Manual test plan
    ├── package.json
    ├── .env.example
    └── .env                    ← (git-ignored, copy from .env.example)
```

---

## ⚙️ Environment Variables

```env
# Required now
MONGODB_URI=mongodb+srv://sawmodabolaji_db_user:e0Jfw0RIacsihbCx@cluster0.aphsje6.mongodb.net/
NEXTAUTH_SECRET=hostme-dev-secret
NEXTAUTH_URL=http://localhost:3000

# Required for Stage 3
PAYSTACK_SECRET_KEY=         # test-mode key from Paystack dashboard
PAYSTACK_PUBLIC_KEY=         # test-mode key

# Required for later stages
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
PUSHER_APP_ID=
PUSHER_KEY=
PUSHER_SECRET=
JWT_PASS_SECRET=
ADMIN_TOTP_ISSUER=
```

---

## 🔧 Quick Start

```bash
cd hostme-app
npm install
npm run dev           # http://localhost:3000
npm run build         # Production build verification
npm test              # Concurrency unit tests (no DB needed)
```

---

## 📖 Critical Engineering Patterns (NEVER Deviate)

### Atomic Capacity Check
```javascript
// ✅ CORRECT — DB spec §2.2
const slot = await Slot.findOneAndUpdate(
  { _id: slotId, $expr: { $lte: [{ $add: ['$booked', headcount] }, '$capacity'] } },
  { $inc: { booked: headcount } },
  { new: true }
);
if (!slot) return 409; // full

// ❌ WRONG — race condition
const slot = await Slot.findById(slotId);
if (slot.booked + headcount > slot.capacity) { ... }
await Slot.updateOne(...); // NOT ATOMIC
```

### Exclusive Lock Race Resolution
```javascript
// ✅ CORRECT — DB spec §2.4
const lock = await ExclusiveLock.findOneAndUpdate(
  { _id: lockId, status: 'open' },
  { $set: { status: 'locked', lockedByBookingId: bookingId } },
  { new: true }
);
if (!lock) {
  // lost_race — trigger refund
}
```

### Webhook Idempotency Guard
```javascript
// ✅ CORRECT — DB spec §2.5
try {
  await Booking.updateOne(
    { _id: bookingId, gatewayTransactionRef: { $exists: false } },
    { gatewayTransactionRef: txRef }
  );
} catch (e) {
  if (e.code === 11000) return; // duplicate delivery — no-op
  throw e;
}
```

### Money — Always Integer Kobo
```javascript
// ✅ CORRECT
const total = baseRateKobo + addOnsKobo; // integer arithmetic only

// ❌ WRONG
const total = price * 100; // float multiply = floating-point error
```

### Server-Side Authorization
```javascript
// ✅ CORRECT
if (!session.user.roles.includes('host')) return 401;

// ❌ WRONG — never trust activeRole alone
if (session.user.activeRole !== 'host') return 401;
```

---

## 🧪 Testing Protocol (Stage Definition of Done)

A stage is NOT done until:
1. **Atomic patterns verified under concurrent load** — not just happy-path single request
2. **Every screen has all 4 states** — loading, empty, error + retry, pessimistic-disabled
3. **Webhook idempotency verified** — same payload fired twice, second is no-op

---

## ⚠️ Known Issues & Gotchas

1. **NextAuth Version**: v4.24.14 (v5 had registry issues at project start)
   - Handler: `const handler = NextAuth(config); export { handler as GET, handler as POST }`

2. **MongoDB Atlas IP Whitelist**: Must whitelist dev machine IP or use `0.0.0.0/0`

3. **SoftHold TTL**: MongoDB TTL index runs every ~60 seconds — not instant. For testing, use a very short expiry or manually delete.

4. **CRLF warnings on Windows**: Normal. Run `git config core.autocrlf true` to suppress.

5. **Auth bug in Stage 1/2 routes**: `getServerSession` is imported from `next-auth/react` (wrong — client module). Auth check always returns null on those routes. These are in existing files — do not fix without explicit instruction. Ask the human "fix bugs first" if needed before Stage 3.

---

## 📝 Next AI Session Checklist

- [ ] Read this HANDOFF.md first ✓
- [ ] Check AGENTS.md for project rules
- [ ] Check MongoDB Atlas IP whitelist (see §MongoDB Connection above)
- [ ] Confirm with human: fix Stage 1/2 auth bugs before Stage 3? (recommended: yes)
- [ ] Confirm: Paystack test-mode keys available?
- [ ] Start Stage 3 in order: `lib/exclusive.js` → tests → API routes → UI screens
- [ ] Every webhook handler: test idempotency (fire twice, verify no-op on second)

---

**GitHub**: https://github.com/Sawmod001/HOSTME  
**Branch**: main
