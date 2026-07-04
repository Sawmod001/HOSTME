# HostMe - API Route Contract

All routes under `/api/`. Auth via NextAuth v5 session (public domain) or custom TOTP session (admin subdomain). Every mutating route validates its payload with Zod before touching the database.

## Auth
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/otp/request` | Send phone OTP |
| POST | `/api/auth/otp/verify` | Verify OTP, issue session |
| POST | `/api/auth/register` | Create user (email, name, phone) |
| POST | `/api/auth/recovery/request` | Email-based recovery magic link |
| POST | `/api/user/switch-role` | Persist `activeRole` UI preference (NOT an authorization grant — see Auth spec §5) |

## Listings
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/listings` | Search/filter (vertical, cityArea, geo radius, bookingType) |
| GET | `/api/listings/:id` | Listing detail |
| POST | `/api/listings` | Create (host) — starts in `draft` |
| PATCH | `/api/listings/:id` | Update (host, own listing only) |
| POST | `/api/listings/:id/submit-review` | draft → pending_review |
| POST | `/api/admin/listings/:id/approve` | pending_review → active (admin) |
| POST | `/api/admin/listings/:id/reject` | pending_review → rejected, requires reason (admin) |

## Slots (Capacity-Based)
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/listings/:id/slots?date=` | Live capacity per slot for a date |
| POST | `/api/slots/:id/reserve` | Atomic headcount reservation → creates SoftHold + Booking (`awaiting_payment`) |

## Exclusive Locks (Exclusive-Space)
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/listings/:id/availability?date=` | Open/locked status per slot |
| POST | `/api/bookings/exclusive/request` | Guest requests a slot → Booking (`pending`) |
| POST | `/api/bookings/:id/approve` | Host approves → Booking (`awaiting_payment`) |
| POST | `/api/bookings/:id/reject` | Host rejects, requires reason |

## Bookings (shared)
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/bookings/:id` | Booking detail incl. status, digital pass payload |
| GET | `/api/bookings?role=guest\|host&status=` | List for inbox views |
| GET | `/api/bookings/:id/cancellation-preview` | Refund tier + amount preview before confirming cancel — see Cancellation & Refund Policy doc |
| POST | `/api/bookings/:id/cancel` | Executes tiered cancellation, triggers gateway split-refund, releases Slot/ExclusiveLock — see Cancellation & Refund Policy doc |

## Payments
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/payments/initiate` | Create gateway checkout session for a Booking |
| POST | `/api/payments/webhook/paystack` | Gateway webhook — idempotent, triggers Slot reservation confirm or ExclusiveLock resolution |
| POST | `/api/payments/webhook/monnify` | Same, other gateway |
| POST | `/api/payments/routing-fee/initiate` | ₦2k–4k paid-chat unlock checkout |

## Chat
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/conversations/:listingId` | Fetch thread (requires routingFeePaid) |
| POST | `/api/conversations/:listingId/messages` | Send message — server-side scrub before persist |
| POST | `/api/conversations/:listingId/voice-note` | Upload + attach voice note |

## Digital Pass & Door Scanner
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/bookings/:id/pass` | JWT-encoded pass payload for QR render |
| POST | `/api/scanner/validate` | Host scans QR → decode JWT, atomic claim (see below) |

```javascript
// Scanner validate — atomic claim to prevent double check-in
const result = await Booking.findOneAndUpdate(
  { _id: bookingId, checkInStatus: { $ne: 'claimed' } },
  { checkInStatus: 'claimed', claimedAt: new Date() },
  { new: true }
);
if (!result) {
  // already claimed — return original claimedAt timestamp for the Crimson duplicate-scan flash
}
```

## Reviews & Disputes
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/bookings/:id/review` | Post-completion review |
| POST | `/api/disputes` | Open a dispute, attach evidence |
| GET | `/api/admin/disputes` | Queue for admin resolution |
| POST | `/api/admin/disputes/:id/resolve` | Resolve with refund or no-action |

## Payout & Identity
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/host/payout-account` | Set bank details → triggers name-resolution check |
| POST | `/api/host/payout-account/change` | Requires OTP step-up, resets trust clock |
| GET | `/api/admin/hosts` | Table with nameMatchStatus, trust state |
| POST | `/api/admin/hosts/:id/verified-badge` | Approve opt-in Verified Host badge |

## Rate Limiting (applies across the above)
Booking-request creation, intake-form submission, and chat-message send are rate-limited per user+IP via Upstash Redis — return `429` with a `Retry-After` header, and the client should surface this as a friendly "slow down" toast, not a raw error.
