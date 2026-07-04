# HostMe - Technical System Design, Database Schemas, & Engineering Guardrails (v2)

## 1. Full-Stack Tech Stack & Infrastructure
- **Framework:** Next.js 15 (App Router). Strict separation of RSC for SEO/Discovery pages and Client Components for interactive checkout maps and chat.
- **Database:** MongoDB Atlas via Mongoose ODM (replica set — required for multi-document transactions used in refund/void flows below).
- **Real-Time Engine:** Pusher or Socket.io (paid chat, live capacity counters, live QR scan feedback).
- **Payment Gateway:** Paystack or Monnify SDK (server-side execution only).
- **Background Jobs:** Upstash/Redis for scheduling soft-hold expiry sweeps, stale-booking cancellation, and rate limiting.

All financial numbers stored as integers (Kobo) to avoid floating-point errors.

---

## 2. Production Database Schemas (Mongoose)

### 2.1 The Listing Model

```javascript
// src/models/Listing.js
import mongoose from 'mongoose';

const ListingSchema = new mongoose.Schema({
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  vertical: { type: String, enum: ['venue', 'housing', 'preorder'], required: true },

  // NEW: determines which booking engine applies. Fixed at creation, not per-booking.
  bookingType: { type: String, enum: ['capacity', 'exclusive'], required: true },

  physicalSpaceId: { type: String, default: null, index: true },
  // RESOLVED: links multiple Listing docs representing the same physical venue — e.g., a lounge
  // that's Capacity-Based on weekday nights and Exclusive-Space for weekend buyouts. Each stays its
  // own Listing with its own bookingType, Slot/ExclusiveLock records, and calendar. This field is
  // purely for host-dashboard grouping (Screen 6) and for validating that the same physical hours
  // aren't accidentally double-listed across two sibling listings — it is NOT a booking-engine key.

  status: {
    type: String,
    enum: ['draft', 'pending_review', 'active', 'suspended', 'rejected'],
    default: 'draft'
  }, // replaces the old isActive boolean — needed to represent admin rejection/suspension states

  title: { type: String, required: true },
  description: { type: String, required: true },
  location: {
    state: { type: String, required: true },
    cityArea: { type: String, required: true },
    address: { type: String, required: true },
    coordinates: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true } // [lng, lat]
    }
  },

  pricing: {
    baseRatePerHour: { type: Number }, // Kobo
    inspectionTransportFee: { type: Number } // housing vertical
  },

  operationalRules: {
    maxCapacity: { type: Number, required: true }, // headcount ceiling per slot (capacity) or venue max (exclusive)
    setupBufferMinutes: { type: Number, default: 30 },
    teardownBufferMinutes: { type: Number, default: 30 }, // NEW — was missing; PRD explicitly requires both
    isByobAllowed: { type: Boolean, default: false },
    cancellationPolicy: { type: String, enum: ['flexible', 'moderate', 'strict'], default: 'moderate' }
    // RESOLVED — see HostMe_Cancellation_Refund_Policy.md for the full tiered refund logic,
    // required because instant split-settlement means a refund has to reverse money that
    // may have already reached the host's account, not just void a held escrow balance.
  },

  addOns: [{
    id: { type: String, required: true },
    name: { type: String, required: true },
    priceInKobo: { type: Number, required: true },
    isRequired: { type: Boolean, default: false }
  }]
}, { timestamps: true });

ListingSchema.index({ location: '2dsphere' });
// NEW: covers the real Screen 1 query pattern ("active venues in Lekki")
ListingSchema.index({ vertical: 1, 'location.cityArea': 1, status: 1 });

export const Listing = mongoose.models.Listing || mongoose.model('Listing', ListingSchema);
```

### 2.2 The Slot Model (Capacity-Based Engine)

One document per bookable date/time window on a `capacity`-type listing. This is the atomic unit that prevents overselling — never compute "remaining capacity" by summing Bookings on the fly; always read/write through this single document.

```javascript
// src/models/Slot.js
import mongoose from 'mongoose';

const SlotSchema = new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true, index: true },
  eventStart: { type: Date, required: true }, // stored UTC
  eventEnd: { type: Date, required: true },
  capacity: { type: Number, required: true },
  booked: { type: Number, default: 0, required: true },     // confirmed + soft-held headcount
  heldUntil: { type: Date, default: null }                  // optional: earliest expiry among active holds, for cheap sweep queries
}, { timestamps: true });

SlotSchema.index({ listingId: 1, eventStart: 1 }, { unique: true });

export const Slot = mongoose.models.Slot || mongoose.model('Slot', SlotSchema);
```

**Atomic reservation (the core safety mechanism).** Never do `read slot -> check capacity in app code -> write`. Do the check and the increment in one atomic Mongo operation:

```javascript
// Reserve headcount atomically — succeeds only if there is room
const slot = await Slot.findOneAndUpdate(
  {
    _id: slotId,
    $expr: { $lte: [{ $add: ['$booked', requestedHeadcount] }, '$capacity'] }
  },
  { $inc: { booked: requestedHeadcount } },
  { new: true }
);

if (!slot) {
  // No document matched -> not enough room. Reject immediately, no partial state created.
  throw new SlotFullError();
}
```

This is safe under concurrent requests because MongoDB guarantees the filter-then-update happens as a single atomic step per document — two simultaneous requests for the last 5 seats cannot both succeed if only 5 remain.

**Soft-hold + release.** The reservation above should happen at "proceed to payment," not at final confirmation, exactly like the OneEvent 10-minute soft hold. Attach a `SoftHold` record with an expiry:

```javascript
// src/models/SoftHold.js
const SoftHoldSchema = new mongoose.Schema({
  slotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true, index: true },
  headcount: { type: Number, required: true },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } } // TTL index — Mongo auto-deletes expired holds
}, { timestamps: true });
```

A cron sweep (Upstash-scheduled, running every 1–2 min) finds `SoftHold` documents whose payment never confirmed and whose TTL has lapsed, and atomically releases the held headcount back:

```javascript
await Slot.updateOne({ _id: slotId }, { $inc: { booked: -headcount } });
await SoftHold.deleteOne({ _id: holdId });
```

Because the TTL index deletes the document automatically, this sweep is a safety net for the corresponding `booked` decrement, not the primary expiry mechanism.

### 2.3 The Booking Model (Shared by Both Engines)

```javascript
// src/models/Booking.js
const BookingSchema = new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true, index: true },
  guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  bookingType: { type: String, enum: ['capacity', 'exclusive'], required: true }, // denormalized for fast queries

  eventStart: { type: Date, required: true },
  eventEnd: { type: Date, required: true },
  headcount: { type: Number, required: true },

  status: {
    type: String,
    enum: [
      'pending',            // exclusive only: awaiting host approval
      'awaiting_payment',   // both: approved / capacity-reserved, payment not yet confirmed
      'confirmed',          // both: payment succeeded, slot secured
      'rejected',           // exclusive only
      'lost_race',          // exclusive only: paid but another guest's payment landed first — auto-refund triggered
      'expired',            // both: soft hold lapsed without payment
      'cancelled',
      'completed',
      'disputed'
    ],
    required: true,
    default: 'pending'
  },

  gatewayTransactionRef: { type: String, index: true, sparse: true }, // used for webhook idempotency, see below
  totalAmountKobo: { type: Number, required: true },
  commissionKobo: { type: Number, required: true }, // 5% of totalAmountKobo, stored explicitly for audit trail
}, { timestamps: true });

// Idempotency guard: a given gateway transaction reference must only ever be processed once
BookingSchema.index({ gatewayTransactionRef: 1 }, { unique: true, sparse: true });

export const Booking = mongoose.models.Booking || mongoose.model('Booking', BookingSchema);
```

### 2.4 The ExclusiveLock Model (Exclusive-Space Engine)

The "first-to-pay wins" mechanism. One document per date/time window on an `exclusive`-type listing.

```javascript
// src/models/ExclusiveLock.js
const ExclusiveLockSchema = new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true, index: true },
  eventStart: { type: Date, required: true },
  eventEnd: { type: Date, required: true },
  status: { type: String, enum: ['open', 'locked'], default: 'open' },
  lockedByBookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null }
}, { timestamps: true });

ExclusiveLockSchema.index({ listingId: 1, eventStart: 1 }, { unique: true });

export const ExclusiveLock = mongoose.models.ExclusiveLock || mongoose.model('ExclusiveLock', ExclusiveLockSchema);
```

**Atomic race resolution**, run inside the payment webhook handler — this is the entire "first-to-pay" mechanism in one call:

```javascript
const lock = await ExclusiveLock.findOneAndUpdate(
  { _id: lockId, status: 'open' },
  { $set: { status: 'locked', lockedByBookingId: bookingId } },
  { new: true }
);

if (!lock) {
  // Someone else's payment already locked this slot before ours landed.
  await Booking.updateOne({ _id: bookingId }, { status: 'lost_race' });
  await triggerAutomaticRefund(bookingId); // mandatory — the guest was charged but did not win the slot
} else {
  await Booking.updateOne({ _id: bookingId }, { status: 'confirmed' });
  // Invalidate every other pending payment link for this window
  await Booking.updateMany(
    { listingId, eventStart, _id: { $ne: bookingId }, status: { $in: ['pending', 'awaiting_payment'] } },
    { status: 'rejected' }
  );
}
```

### 2.5 Webhook Idempotency (applies to both engines)

Every gateway webhook handler must check-then-process using the unique index on `gatewayTransactionRef` as the guard, not application logic:

```javascript
try {
  await Booking.updateOne(
    { _id: bookingId, gatewayTransactionRef: { $exists: false } },
    { gatewayTransactionRef: txRef }
  );
} catch (e) {
  if (e.code === 11000) return; // duplicate webhook delivery — already processed, no-op
  throw e;
}
// proceed with slot reservation / lock resolution only after this guard passes
```

---

## 3. Phase 1 Engineering Guardrails & NFRs

- **No Escrow Holding Code** beyond the narrow, timed new-host payout delay described in the Identity spec — that is a release-timer, not a wallet.
- **Mobile-First CSS.**
- **Pessimistic UI States** — disable/loading immediately on click.
- **No Mega-Event Architectures** — optimize for <100-person single-host bookings.
- **Never compute capacity via aggregation on read** — always via the atomic `Slot` document above. Aggregation-on-read is the #1 source of overselling bugs in booking systems under real concurrent load.
- **Transactions reserved for the refund path only** — the atomic single-document patterns above cover reservation and locking without needing multi-document transactions; reserve those for the "charge succeeded but lock lost" refund + booking-status write, where both must succeed or both must roll back.
