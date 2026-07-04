# HostMe - Remaining Data Models (User, Payment, Chat, Reviews, Notifications)

These complete the schema set alongside `Listing`, `Slot`, `SoftHold`, `Booking`, and `ExclusiveLock` from the Database Schemas v2 doc. All financial fields remain integers (Kobo).

## 1. User Model

```javascript
// src/models/User.js
import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: { type: String, required: true, unique: true },
  phoneVerified: { type: Boolean, default: false },
  fullName: { type: String, required: true },

  roles: { type: [String], enum: ['guest', 'host', 'agent', 'admin'], default: ['guest'] },
  activeRole: { type: String, enum: ['guest', 'host', 'agent', 'admin'], default: 'guest' },
  // RESOLVED: dual-role accounts are supported — one account can hold guest + host (or more)
  // simultaneously. `activeRole` is session-level UI context set by the role-switcher (see PRD §3,
  // Screen 1). It is NOT a permission boundary by itself: every server-side permission check must
  // verify `roles.includes(requiredRole)`, never `activeRole` alone — activeRole is a display
  // convenience and can be spoofed client-side, so trusting it for authorization is a real hole.

  payout: {
    bankCode: { type: String },
    accountNumber: { type: String },
    resolvedAccountName: { type: String },        // returned by gateway resolution API
    nameMatchStatus: {
      type: String,
      enum: ['unmatched', 'matched', 'flagged_for_review'],
      default: 'unmatched'
    }
  },

  trust: {
    completedTransactionCount: { type: Number, default: 0 },
    payoutDelayActive: { type: Boolean, default: true },   // true until N completed transactions
    velocityCapKobo: { type: Number, default: 5000000 },   // ₦50,000 default cap for new hosts
    verifiedHostBadge: { type: Boolean, default: false }    // opt-in ID upload, admin-approved
  },

  status: { type: String, enum: ['active', 'suspended', 'banned'], default: 'active' }
}, { timestamps: true });

export const User = mongoose.models.User || mongoose.model('User', UserSchema);
```

## 2. Transaction / Payment Ledger Model

Separate from `Booking` — a booking can have multiple related money movements (charge, refund, payout), and this table is your audit trail and reconciliation source of truth. Never infer financial history from `Booking.status` alone.

```javascript
// src/models/Transaction.js
const TransactionSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
  type: {
    type: String,
    enum: ['charge', 'refund', 'host_payout', 'platform_commission'],
    required: true
  },
  amountKobo: { type: Number, required: true },
  gatewayTransactionRef: { type: String, required: true, index: true },
  gateway: { type: String, enum: ['paystack', 'monnify'], required: true },
  status: { type: String, enum: ['pending', 'success', 'failed'], required: true },
  payoutReleaseAt: { type: Date, default: null }, // set for host_payout when new-host delay applies; null = instant
}, { timestamps: true });

TransactionSchema.index({ gatewayTransactionRef: 1, type: 1 }, { unique: true }); // idempotency guard per transaction type

export const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);
```

## 3. Chat / Message Model (Paid Inquiry Workspace)

```javascript
// src/models/Message.js
const MessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true }, // one per guest-host-listing thread
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  rawContent: { type: String, required: true },      // stored for admin fraud review ONLY, never rendered to users
  displayContent: { type: String, required: true },  // scrubbed version — phone/bank patterns replaced with [REDACTED]
  wasScrubbed: { type: Boolean, default: false },     // flags conversation for Fraud Monitor

  voiceNoteUrl: { type: String, default: null },      // Cloudinary URL if audio note
  routingFeePaid: { type: Boolean, required: true },  // gate: chat only unlocked after ₦2k-4k fee
}, { timestamps: true });

MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ wasScrubbed: 1 }); // for Fraud Monitor queries

export const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);
```

**Scrubbing rule:** run the regex scrub server-side before write, store both `rawContent` (admin-only, never sent to any client) and `displayContent`. Never scrub client-side only — a modified client could bypass it.

## 4. Review & Dispute Model

```javascript
// src/models/Review.js
const ReviewSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  revieweeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String },
}, { timestamps: true });

// src/models/Dispute.js
const DisputeSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
  raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, required: true },
  evidenceUrls: [{ type: String }], // Cloudinary uploads — photos of the issue
  status: { type: String, enum: ['open', 'under_review', 'resolved_refund', 'resolved_no_action'], default: 'open' },
  adminNotes: { type: String },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
```

**Note:** no cancellation-policy tiers are defined yet for HostMe (unlike OneEvent's flexible/moderate/strict model) — this is still an open gap. Given instant settlement with no escrow hold, a guest cancelling minutes after paying currently has no built-in remedy except a manual admin-reviewed Dispute. Worth a decision before this ships: either accept manual dispute resolution as the Phase 1 answer, or borrow a lightweight version of OneEvent's tiered policy.

## 5. Notification Model & Trigger Matrix

```javascript
// src/models/Notification.js
const NotificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  channel: { type: String, enum: ['email', 'sms', 'in_app', 'push'], required: true },
  type: { type: String, required: true }, // matches trigger matrix below
  payload: { type: mongoose.Schema.Types.Mixed },
  status: { type: String, enum: ['queued', 'sent', 'failed'], default: 'queued' },
  readAt: { type: Date, default: null },
}, { timestamps: true });
```

| Trigger | Recipient | Channel |
|---|---|---|
| Booking request received | Host | in_app, email |
| Booking approved (exclusive) | Guest | in_app, sms, email |
| Booking rejected | Guest | in_app, email |
| Slot sold out (capacity) | Guest attempting to book | in_app |
| Payment confirmed | Guest + Host | in_app, sms, email |
| Lost race / auto-refund issued | Guest | in_app, sms, email |
| Soft hold expiring in 2 min | Guest | in_app (real-time, e.g. Pusher) |
| Chat message received (post-fee) | Recipient | in_app, push |
| Scrub event triggered | Admin only | in_app (Fraud Monitor) |
| Dispute opened | Both parties + Admin | in_app, email |
| Host payout released | Host | sms |
| Host account flagged (name mismatch) | Host | email |
