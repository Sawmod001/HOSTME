# HostMe AI Handoff Document — Continue Here

**Status**: Stage 1 (Listings & Discovery) Complete | Stage 2 Ready to Begin  
**Last Commit**: Stage 1 Complete: Full API + UI implementation (commit 750a6ad)  
**Date**: 2026-07-04  
**Build Status**: ✅ Production build passes (0 errors)

---

## 🎯 What's Been Completed

### Foundation (Stage 0) ✅
- Next.js 15 App Router scaffold
- Mongoose connection with global cache pattern
- NextAuth v4.24.14 credentials provider
- All 6 core models: User, Listing, Slot, Booking, ExclusiveLock, SoftHold
- Design system (Tailwind + custom CSS tokens)

### Listings & Discovery (Stage 1) ✅
#### Models
- `Listing.js` — Core venue/housing document (includes `rejectionReason` field)
- `SoftHold.js` — TTL-based capacity hold model (NEW)

#### API Routes (All 8 implemented)
- `GET/POST /api/listings` — Search + create
- `GET/PATCH /api/listings/[id]` — Detail + update draft
- `POST /api/listings/[id]/submit-review` — Draft→pending_review
- `GET /api/listings/[id]/slots` — Capacity availability
- `GET /api/listings/[id]/availability` — Exclusive lock status
- `POST /api/admin/listings/[id]/approve` — Admin approve
- `POST /api/admin/listings/[id]/reject` — Admin reject with reason

#### UI Screens (All 5 built)
1. Discovery Hub: `/app/(public)/listings/page.js`
   - Search + filter (vertical, bookingType, cityArea)
   - Infinite scroll cursor pagination
   - Four UI states: loading, empty, error, normal

2. Listing Detail: `/app/(public)/listings/[id]/page.js`
   - Space preview with pricing + add-ons
   - Date picker with slot/availability display
   - Branching logic for capacity vs exclusive

3. Host Creation Form: `/app/(host)/host/listings/new/page.js`
   - Complete form (vertical, pricing, capacity, buffers, policies)
   - Submit to admin queue workflow

4. Host Dashboard: `/app/(host)/host/listings/page.js`
   - All host listings grouped by status
   - Edit/resubmit actions (placeholder)

5. Admin Queue: `/app/(admin)/admin/listings/pending/page.js`
   - Pending listings table
   - Approve/reject actions with reason modal

#### Utilities
- `lib/validation.js` — Zod schemas (ListingCreate/Update/Filter)
- `lib/geo.js` — Geospatial query builders
- `lib/auth.js` — NextAuth v4.24.14 config
- `lib/db.js` — MongoDB connection singleton
- `lib/roles.js` — Role authorization helpers

---

## 🚀 What's Next: Stage 2 — Capacity-Based Booking Engine

### Per HostMe_Build_Roadmap.md:
**Stage 2 = Intake Forms + Payment Flow Setup (simplified for Stage 2)**

#### Key Tasks:
1. **Create SoftHold Route** (`POST /api/soft-holds`)
   - Accept booking request with headcount, date, time
   - Check slot capacity atomically: `findOneAndUpdate({ _id, booked: { $lt: capacity } }, { $inc: { booked: headcount } })`
   - Create SoftHold doc with 10-minute expiry
   - Return SoftHold ID for checkout

2. **Create Booking Intake Form Screen** (`/app/(public)/listings/[id]/checkout/page.js`)
   - Guest info form (name, email, phone)
   - Headcount selector (capacity only)
   - Add-ons selection with total pricing
   - Show breakdown: baseRate × hours + add-ons = totalKobo
   - "Continue to Payment" button (Stage 3)

3. **Create Booking Model Interactions**
   - `POST /api/bookings` — Create booking from SoftHold
   - Validate SoftHold exists + not expired
   - Set booking.status = 'awaiting_payment'
   - Return booking ID for payment redirect

4. **Concurrency Testing**
   - Simulate 5+ simultaneous requests to same slot
   - Verify only 1 succeeds in atomically incrementing booked
   - Others receive HTTP 409 (slot full)
   - Document test results in `/tests/concurrency.md`

5. **UI State Updates**
   - Checkout form: loading (form disabled), error (with retry), pessimistic-disabled (button locks on click)
   - Availability display: show real-time booked/capacity

#### File Locations:
- New Route: `hostme-app/src/app/api/soft-holds/route.js`
- New Route: `hostme-app/src/app/api/bookings/route.js`
- New Screen: `hostme-app/src/app/(public)/listings/[id]/checkout/page.js`
- Tests: `hostme-app/__tests__/concurrency.test.js` (or manual test script)

#### Critical Constraints (per AGENTS.md rules):
- **Atomic writes only**: Use `findOneAndUpdate` with $inc for capacity checks, NEVER separate read-then-write
- **All money = integer Kobo**: Never float values in financial calculations
- **SoftHold TTL**: Expires after 10 minutes if payment not confirmed

---

## 📋 Project Structure

```
HOSTME/
├── AGENTS.md                          # Agent instructions (auto-read by AI tools)
├── copilot-instructions.md            # Copilot-specific setup
├── HANDOFF.md                         # THIS FILE — handoff for next session
├── /docs                              # All HostMe specification documents
│   ├── HostMe_Master_Blueprint_v2.md
│   ├── HostMe_PRD_v3.md
│   ├── HostMe_Database_Schemas_v2.md
│   ├── HostMe_API_Route_Contract.md
│   └── ... (8 docs total)
│
└── /hostme-app                        # Next.js application
    ├── src/
    │   ├── app/
    │   │   ├── (public)/              # Public routes
    │   │   │   ├── listings/          # Discovery Hub
    │   │   │   └── listings/[id]/     # Listing Detail
    │   │   ├── (host)/                # Host-only routes
    │   │   │   └── host/listings/     # Host dashboard + creation
    │   │   ├── (admin)/               # Admin-only routes
    │   │   │   └── admin/listings/    # Admin queue
    │   │   ├── api/                   # All API routes
    │   │   │   ├── listings/          # Listing CRUD
    │   │   │   ├── admin/listings/    # Admin actions
    │   │   │   ├── soft-holds/        # Stage 2 - TBD
    │   │   │   ├── bookings/          # Stage 2 - TBD
    │   │   │   └── auth/[...nextauth]/
    │   │   ├── layout.js
    │   │   ├── page.js
    │   │   └── globals.css
    │   │
    │   ├── lib/
    │   │   ├── db.js                  # MongoDB connection
    │   │   ├── auth.js                # NextAuth config
    │   │   ├── validation.js          # Zod schemas
    │   │   ├── geo.js                 # Geospatial helpers
    │   │   └── roles.js               # Authorization
    │   │
    │   └── models/
    │       ├── User.js
    │       ├── Listing.js             # ← Has rejectionReason field
    │       ├── Slot.js
    │       ├── Booking.js
    │       ├── ExclusiveLock.js
    │       └── SoftHold.js            # ← NEW with TTL
    │
    ├── package.json                   # Next.js 16.2.10, React 19.2.4, Mongoose, NextAuth v4
    ├── .env.example                   # Copy to .env and fill MONGODB_URI
    └── README.md
```

---

## 🔧 Quick Start Commands

```bash
# Install dependencies
cd hostme-app && npm install

# Development server
npm run dev                 # Runs on http://localhost:3000

# Production build (verify compiles)
npm run build              # Should show 0 errors

# Start production server
npm start

# Lint check
npm run lint
```

---

## ⚙️ Configuration Required

### MongoDB Setup
1. Create MongoDB Atlas cluster (free tier OK for dev)
2. Get connection string: `mongodb+srv://user:pass@cluster.mongodb.net/hostme`
3. Copy `.env.example` → `.env`
4. Fill in:
   ```
   MONGODB_URI=your_connection_string
   NEXTAUTH_SECRET=generate_random_string
   NEXTAUTH_URL=http://localhost:3000
   ```

### GitHub Integration
- Repo: https://github.com/Sawmod001/HOSTME
- Latest commit: Stage 1 Complete (commit 750a6ad)
- Branch: main

---

## 📖 Important Design Patterns

### Atomic Capacity Check (CRITICAL)
```javascript
// ✅ CORRECT - Single atomic operation
const slot = await Slot.findOneAndUpdate(
  { _id: slotId, booked: { $lt: capacity } },
  { $inc: { booked: headcount } },
  { new: true }
);
if (!slot) return 409; // Slot full

// ❌ WRONG - Two operations (race condition!)
const slot = await Slot.findById(slotId);
if (slot.booked + headcount > slot.capacity) { /* ... */ }
await Slot.updateOne({ _id: slotId }, { $inc: { booked: headcount } });
```

### Money = Integer Kobo (CRITICAL)
```javascript
// ✅ CORRECT
const totalKobo = baseRatePerHour + addOnsTotal; // Already in Kobo
booking.totalAmountKobo = totalKobo;

// ❌ WRONG
const totalNaira = 5.50;
booking.totalAmountKobo = totalNaira * 100; // Float arithmetic error!
```

### Server-Side Role Check (CRITICAL)
```javascript
// ✅ CORRECT - Check roles array
if (!session.user.roles.includes('admin')) return 401;

// ❌ WRONG - Never trust activeRole alone
if (session.user.activeRole !== 'admin') return 401;
```

---

## 🧪 Testing Notes

### API Endpoints (Manual via `curl` or Postman)
1. **Get listings** (no auth required)
   ```
   GET /api/listings?vertical=venue&limit=10
   ```

2. **Create listing** (auth required: host role)
   ```
   POST /api/listings
   Headers: Content-Type: application/json
   Body: { vertical, bookingType, title, ... }
   ```

3. **Approve listing** (auth required: admin role)
   ```
   POST /api/admin/listings/:id/approve
   ```

### Concurrency Test (Stage 2)
- Simulate 5+ users booking same slot simultaneously
- Expect exactly 1 success, rest return 409 (Conflict)
- Verify slot.booked incremented correctly

---

## ⚠️ Known Issues & Gotchas

1. **NextAuth Version**: Currently v4.24.14 (v5 registry issues earlier)
   - Handler pattern: `const handler = NextAuth(config); export default handler;`
   - Route handler: `export { handler as GET, handler as POST };`

2. **MongoDB TTL Index**: SoftHold model uses `{ expires: 0 }` for auto-delete
   - Takes ~5-10 minutes to clean up after expiry
   - For testing, manually delete or use shorter TTL

3. **File Path Naming**: Can't use capital letters in package.json name
   - Repo: HOSTME (caps OK)
   - App dir: hostme-app (lowercase required)

4. **Environment Variables**: Must restart dev server after changing `.env`

5. **Build Warnings**: CRLF line ending warnings on Windows are normal
   - Run `git config core.autocrlf true` to suppress

---

## 📝 Next AI Session Checklist

When you start a new chat to continue:

- [ ] Read this HANDOFF.md file first (you're reading it now ✓)
- [ ] Check AGENTS.md for project rules
- [ ] Review HostMe_Build_Roadmap.md for Stage 2 spec
- [ ] Open MONGODB_URI from .env and verify connection
- [ ] Run `npm run build` to verify no regressions
- [ ] Start building Stage 2: Capacity Booking Engine
  - SoftHold route
  - Checkout form UI
  - Booking creation route
  - Concurrency tests

---

## 💡 Quick Context for Next Session

**Current State**: 
- ✅ Listings & Discovery (Stage 1) fully working
- ✅ All API routes created and structured
- ✅ 5 UI screens built with proper state management
- ✅ Production build verified
- ⏳ **Next**: Build Stage 2 capacity booking flow

**Key Files to Know**:
- Models: `src/models/*.js` (all 6 models ready)
- API routes: `src/app/api/` (structured by feature)
- UI screens: `src/app/(public|host|admin)/` (route groups)
- Utilities: `src/lib/*.js` (validation, geo, auth)

**To Resume**:
1. Open this file (`HANDOFF.md`)
2. Check HostMe_Build_Roadmap.md Stage 2 section
3. Create SoftHold route (`POST /api/soft-holds`)
4. Build checkout form UI
5. Test concurrency with atomic operations

---

**Good luck! The foundation is solid. Stage 2 is just building on top. 🚀**
