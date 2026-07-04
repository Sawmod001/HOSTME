# HostMe - Master Product Requirements Document (PRD) & Functional Specification (v3)

## 1. System Vision & Product Philosophy

HostMe is a high-performance, multi-vertical transactional marketplace engineered for the Nigerian commercial hospitality and mid-tier real estate ecosystems.

The platform rejects traditional escrow holding models. Instead, it operates as an **Instant Split Checkout Coordination Service**. By integrating directly with payment gateway merchant sub-accounts (via Monnify or Paystack), HostMe settles funds immediately upon transaction execution.

### 1.1 Core Strategic Pillars & Logic

- **Instant Split Settlement:** The platform automatically calculates and retains a **5% commission**, routing **95%** directly to the Host's verified bank account the exact millisecond the gateway confirms a successful charge.
- **Lite Identity, Not KYC:** HostMe does not run NIN/BVN + facial recognition verification at signup. Hosts register with email, full name, and phone (OTP-verified). Before a host can receive payouts, their declared bank account is checked against the gateway's **account-name-resolution** endpoint and fuzzy-matched to their registered name. This is a single low-friction API call, not a KYC pipeline — see the Identity spec for the full compensating-controls model (payout delay window and transaction velocity caps for new hosts).
- **Intake Form Gatekeeping (Friction by Design):** Guests cannot blindly block dates. They must complete a strict quota checklist (exact headcount, event intent, required add-ons). This payload acts as the foundational contract for the booking.
- **Optional Paid Inquiry Chat:** Casual inquiries are blocked. Users who wish to negotiate, request custom setups, or ask questions must pay a non-refundable `Platform Routing Fee` (₦2,000 – ₦4,000). This unlocks an encrypted, actively-scrubbed communication interface.
- **Dual Booking Engine:** Every listing is configured at creation time as either **Capacity-Based** or **Exclusive-Space** (see §2.1). This determines which concurrency model, UI, and state machine apply — it is not decided per-booking.

---

## 2. The Three Core Verticals (Business Logic)

### 2.1 Event Spaces (Venues)

Every venue listing declares a `bookingType` at creation:

**A. Capacity-Based** — meals, sit-and-watch specials (game nights, screenings, live sets), or any offering where the guest buys access to a shared space.
- Host sets `maxCapacity` per slot.
- Multiple independent guests can book the same date/time concurrently as long as combined headcount stays under capacity.
- Slot closes automatically once capacity is exhausted — no manual host action required.
- Host retains a manual "Reject/Adjust" override for edge cases where headcount math doesn't reflect real physical space usage.

**B. Exclusive-Space** — birthdays, full lounge buyouts, photoshoots requiring the whole venue — any booking where the guest pays for sole use of the space during that window.
- Host can approve multiple pending requests for the same slot; the slot stays open until payment.
- First successful payment atomically locks the slot and invalidates every other pending payment link for that window.
- Once locked, no other booking of any type can be layered onto that space/time.

- **Pricing Engine:** Base Hourly Rate × Selected Hours + Flat Rate Add-ons (e.g., +₦15k for Dedicated Generator).
- **Buffer Time Logic:** The system automatically injects host-defined Setup and Teardown buffer windows around selected slots to prevent back-to-back operational collisions. Buffers apply identically to both booking types.
- **Core Action Hooks:** `[ Direct Instant Book ]` (Capacity-Based) or `[ Request to Book ]` → `[ Pay to Lock Slot ]` (Exclusive-Space), or `[ Pay Fee & Message Host ]` for either.

### 2.2 Commercial Real Estate (Regulated Housing & Short-lets)

- Target Focus: Verified real estate agents listing short-lets, co-working slots, or corporate commercial property files.
- The customer cannot pay rent on the platform. Instead, they pay a standardized `Platform Inspection & Transport Fee`.
- State Machine: User selects viewing time → Agent Approves → User pays inspection fee → Digital Access Pass generated → Agent scans pass at physical location to trigger their transport payout.

### 2.3 On-Site Pre-Ordering (Inventory & Food)

- Target Focus: Reserving drink packages, food platters, or equipment rentals.
- Cart Logic: Dynamic array attached to the `Booking` schema. If attached to a Venue booking, the total is aggregated into a single checkout flow. Can also function as a standalone fulfillment pipeline for quick-service pickups.

---

## 3. Comprehensive UI/UX Screen Architecture Matrix

Mobile-first Tailwind CSS, scaling up to desktop. 8 core application views:

### Screen 1: The Landing Discovery Hub
Global Vertical Switcher, fuzzy-matching search with regional hubs, infinite-scroll feed. Listing cards show a `bookingType` badge (e.g., "Shared — 12/40 seats left" vs. "Exclusive — Request to Book") so guests know which flow they're entering before they click in.

### Screen 2: Space Details & Selection Grid
Media carousel, infrastructure filter icons, and a **Micro-Calendar Planner** whose behavior branches on `bookingType`:
- Capacity-Based: shows live remaining capacity per slot, updating in real time as others book.
- Exclusive-Space: shows slot as "Open" or "Locked," with no capacity counter.

### Screen 3: Customer Intake Form Checklist
Step-by-step modal intercepting "Book Now." Numeric headcount dial validated against `maxCapacity`. Conditional add-on toggles update running total live.

### Screen 4: The Premium Paid Chat Workspace
Real-time messaging with the Anti-Leakage Engine (regex-masks phone numbers, bank names, account numbers to `[REDACTED]`). Inline voice notes stored to Cloudinary.

### Screen 5: The Unforgeable Digital Ticket Room
Dark-mode, live-ticking clock, center QR (JWT payload). For Capacity-Based bookings, the pass encodes the purchased headcount so one scan validates the whole party.

### Screen 6: Host Management Workspace
Inbox by state. For Exclusive-Space listings: `[ APPROVE ]` / `[ DENY ]` per request. For Capacity-Based listings: a live fill-meter view ("28/40 booked") replaces the approve/deny queue, since acceptance is automatic up to capacity.

### Screen 7: The Host Door Scanner Interface
Full-viewport camera scanner. Emerald flash on valid first scan (locks state to `CLAIMED`); Crimson flash on duplicate scan, showing original check-in timestamp.

### Screen 8: Super-Admin Central Command (CMS)
- Host accounts table showing bank-account-name-match status (not KYC status).
- New-host payout delay and velocity-cap indicators, with manual override.
- Fraud Monitor: flagged chat-scrubber events, dispute queue.
- God-Mode Controls: force refunds, suspend listings, adjust commission rate.

---

## 4. Phase 1 Engineering Guardrails & NFRs

- **No Escrow Holding Code:** Use Paystack/Monnify Split endpoints exclusively — except the narrow new-host payout delay window described in the Identity spec, which is a timed release, not a wallet.
- **Mobile-First CSS:** Nigerian web traffic is 85%+ mobile; desktop is a progressive enhancement.
- **Pessimistic UI States:** Buttons enter disabled/loading state immediately on click to prevent duplicate API calls under high latency.
- **No Mega-Event Architectures:** No seating charts, multi-day ticket tiers, or 1,000+ attendee QR systems. Optimize for single-host, private-event bookings (<100 people).
- **Webhook Idempotency (new):** Every payment webhook handler must dedupe on the gateway's transaction reference before mutating booking/slot state. Retried webhooks must be no-ops on the second delivery.
- **Rate Limiting (new):** Booking-request creation and intake-form submission are rate-limited per user/IP via the existing Upstash Redis layer, to prevent inbox-flooding and probing attacks against a listing's approval pattern.
