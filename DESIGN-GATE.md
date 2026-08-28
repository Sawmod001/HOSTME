# CLOCKHOST — PRE-IMPLEMENTATION DESIGN GATE

> **Status:** AWAITING REVIEW — Do not begin coding until all documents are approved.
> **Date:** 2026-08-28
> **This document supersedes all prior implementation plans until approved.**

---

# DOCUMENT A: PRODUCT / SYSTEM MAP

## A1. Product Identity

| Property | Value |
|----------|-------|
| Product name | ClockHost |
| Market | Nigeria |
| Currency | Nigerian Naira (₦) |
| Timezone | Africa/Lagos (WAT, UTC+1) |
| Payment gateway | Paystack |
| Auth provider | Clerk |
| Database | Supabase (PostgreSQL + PostGIS) |
| Framework | Next.js 16 (App Router, Turbopack) |

## A2. Account Roles

```
ClockHost Account
├── Guest
├── Venue Host
│   └── Listing Type: Venue
│   └── Listing Type: Outdoor Space
├── Shortlet Apartment Host
│   ├── Business Type: Housing Agent
│   └── Business Type: Property Owner
└── Admin
```

**Rules:**
- One account = one role only. No multi-role accounts.
- Role is selected during onboarding and stored in `users.role`.
- Business type is a sub-classification within the provider role, not a separate role.
- Listing type is determined at listing creation, not at account level.

## A3. Role Definitions

### Guest
A person who browses, searches, and books venues or shortlet apartments.

**Capabilities:**
- Browse and search public listings
- View listing details, photos, availability, pricing
- Create bookings (capacity or exclusive)
- Make payments
- Join group bookings
- View booking history
- Cancel bookings (per policy)
- Leave reviews
- Request housing viewings
- Upload payment evidence
- Manage profile
- Send/receive messages

### Venue Host
A person who manages a physical venue that customers can visit.

**Capabilities:**
- Create ONE listing (Venue OR Outdoor Space)
- Configure availability (recurring schedule, special dates, blocked periods)
- Configure pricing (per guest/hour or exclusive period)
- Configure booking modes (capacity, exclusive, or both)
- View and manage reservations
- Check in guests
- Respond to reviews
- View earnings and analytics
- Manage messages
- Manage settings
- Submit verification documents

**Restrictions:**
- Cannot create a second listing under the same account
- Cannot create both Venue and Outdoor Space
- Cannot access housing features

### Venue Host — Venue Listing
A physical place customers can visit (lounge, bar, club, leisure venue).

**Booking modes available:**
- Capacity Booking (per guest/hour)
- Exclusive Booking (reserve entire venue)
- Both (configurable)

### Venue Host — Outdoor Space Listing
An open area for parties, gatherings, events.

**Booking modes available:**
- Exclusive Booking ONLY
- No capacity booking

### Shortlet Apartment Host
A person who manages shortlet/rental properties.

**Business types:**
- Housing Agent: May manage multiple properties for clients
- Property Owner: Manages own properties

**Capabilities:**
- Create multiple property listings
- Configure monthly pricing and lease durations
- Manage viewing requests
- Upload property documents
- Manage reservations
- Handle disputes
- View earnings

### Admin
A platform administrator with controlled authorization.

**Capabilities:**
- Review and approve/reject provider verification
- Review and approve/reject/suspend listings
- Review bookings, payments, refunds
- Review disputes and evidence
- Review reports
- Monitor system health
- View audit trail
- Suspend providers
- Make refund decisions

## A4. Listing Types

| Type | Parent Role | Booking Modes | Pricing Model |
|------|------------|---------------|---------------|
| Venue | Venue Host | Capacity, Exclusive, or Both | Per guest/hour or exclusive period rate |
| Outdoor Space | Venue Host | Exclusive Only | Per period rate |
| Shortlet Apartment | Shortlet Apartment Host | Monthly lease | Monthly rent + lease duration |

## A5. Complete Workflow Maps

### Guest Workflow
```
1.  Sign up (email + password)
2.  Complete profile (phone, location, gender optional)
3.  Browse/search listings
4.  View listing details (description, photos, amenities, rules, pricing)
5.  Check availability (dates, times, capacity)
6.  Select booking configuration
    ├── Capacity: select date, time, guest count
    └── Exclusive: select date, start time, end time
7.  Review pricing breakdown
    ├── Base amount
    ├── Discount (if applicable)
    ├── Venue-spend entitlement
    ├── Payment fee
    └── Total
8.  Checkout → Paystack payment
9.  Booking confirmation
10. Receive booking receipt
11. Share with group members (if group booking)
12. Check in (token verification at venue)
13. Complete booking
14. Leave review
```

### Venue Host Workflow
```
1.  Sign up (email + password)
2.  Complete provider profile (name, phone, business info)
3.  Select listing type: Venue or Outdoor Space
4.  Create listing
    ├── Basic info (name, description)
    ├── Location (address, area, city)
    ├── Photos (primary + gallery)
    ├── Capacity (Venue only)
    ├── Booking modes (Venue: capacity/exclusive/both; Outdoor: exclusive only)
    ├── Amenities (structured select)
    ├── Offerings (structured sections)
    ├── Rules
    └── Pricing
5.  Submit for review
6.  Admin reviews → approve/reject
7.  If approved → listing goes live
8.  Configure availability
    ├── Recurring weekly schedule
    ├── Special dates
    └── Blocked periods
9.  Receive booking notifications
10. Manage reservations
11. Check in guests (token verification)
12. Complete bookings
13. Release escrowed funds
14. Respond to reviews
15. View earnings and analytics
16. Manage messages
17. Submit verification documents
```

### Shortlet Apartment Host Workflow
```
1.  Sign up (email + password)
2.  Complete provider profile
3.  Select business type: Housing Agent or Property Owner
4.  Create property listing
    ├── Property info (title, type, description)
    ├── Location
    ├── Photos
    ├── Rooms/bedrooms/bathrooms
    ├── Amenities
    ├── Monthly pricing
    ├── Lease duration options
    ├── Deposit requirements
    ├── House rules
    └── Viewing information
5.  Submit for review
6.  Admin reviews → approve/reject
7.  Listing goes live
8.  Configure availability
9.  Receive viewing requests
10. Manage viewing schedule
11. Receive booking/application
12. Process payment
13. Handle documents/evidence
14. Manage reservation
15. Handle disputes if needed
16. Complete/dispute resolution
```

### Admin Workflow
```
1.  Review pending provider verifications
2.  Approve/reject verification documents
3.  Review pending listings
4.  Approve/reject/suspend listings
5.  Monitor active bookings
6.  Review payment records
7.  Process refunds when authorized
8.  Handle disputes
9.  Review reports
10. Suspend providers if necessary
11. View audit trail
12. Monitor system health
```

---

# DOCUMENT B: UX/UI MAP

## B1. Public Pages

### Homepage (`/`)
| Property | Value |
|----------|-------|
| Purpose | Discovery and entry point |
| User | Everyone (public) |
| Data | Featured listings, categories, locations, testimonials |
| Actions | Browse, search, navigate to sign-in/sign-up |
| Mobile | Full responsive, hamburger nav |

### Sign-In (`/sign-in`)
| Property | Value |
|----------|-------|
| Purpose | Authenticate existing user |
| User | Unauthenticated |
| Data | Email, password |
| Actions | Sign in → redirect based on role/completion |
| Error | Invalid credentials, rate limit |

### Sign-Up (`/sign-up`)
| Property | Value |
|----------|-------|
| Purpose | Create new account |
| User | Unauthenticated |
| Data | Email, password, confirm password |
| Actions | Create account → redirect to complete profile |
| Error | Weak password, existing email |

### Complete Profile (`/complete-profile`)
| Property | Value |
|----------|-------|
| Purpose | Onboarding after first sign-in |
| User | Authenticated, profile incomplete |
| Data | Role selection, phone, name, business info (providers) |
| Actions | Select role → fill role-specific form → submit |
| Redirect | Guest → /dashboard, Provider → /host/dashboard |

### Listings Browse (`/listings`)
| Property | Value |
|----------|-------|
| Purpose | Browse and filter available listings |
| User | Everyone (public for active listings) |
| Data | Listing cards with photo, name, location, price, rating |
| Actions | Filter (type, area, price, booking mode), sort, search |
| Empty | "No listings found" with suggestions |

### Listing Detail (`/listings/[id]`)
| Property | Value |
|----------|-------|
| Purpose | Full listing information |
| User | Everyone (public for active listings) |
| Data | Photos, description, amenities, rules, pricing, availability, reviews |
| Actions | Check availability, start booking, contact host |
| Sections | About, What you can do, Amenities, Food & Drinks, Rules, Booking Info, Reviews |

### Booking Checkout (`/listings/[id]/checkout`)
| Property | Value |
|----------|-------|
| Purpose | Configure and pay for booking |
| User | Authenticated guest |
| Data | Date, time, guest count, pricing breakdown |
| Actions | Adjust configuration, see price breakdown, proceed to payment |
| Pricing | Base, discount, venue-spend, fee, total |

### Booking Confirmation
| Property | Value |
|----------|-------|
| Purpose | Confirm successful booking |
| User | Guest who completed payment |
| Data | Booking reference, details, receipt, check-in info |
| Actions | View receipt, share with group, return to dashboard |

## B2. Guest Dashboard Pages

### Dashboard (`/dashboard`)
| Property | Value |
|----------|-------|
| Purpose | Guest booking overview |
| User | Guest |
| Data | Upcoming, pending, past bookings |
| Actions | View booking details, cancel, review |
| Stats | Upcoming count, pending count, total spent |

### Booking Detail (`/bookings/[id]`)
| Property | Value |
|----------|-------|
| Purpose | View single booking details |
| User | Guest (booking owner) |
| Data | Full booking info, pricing, venue, check-in info, receipt |
| Actions | Cancel, check in, view receipt, share (group) |

### Profile (`/profile`)
| Property | Value |
|----------|-------|
| Purpose | View and edit profile |
| User | Authenticated |
| Data | Name, email, phone, location, avatar |
| Actions | Edit profile, change settings |

## B3. Venue Host Dashboard Pages

### Host Dashboard (`/host/dashboard`)
| Property | Value |
|----------|-------|
| Purpose | Venue host overview |
| User | Venue Host |
| Data | Listing status, upcoming bookings, earnings, pending actions |
| Stats | Active bookings, total earnings, pending reviews, listing status |
| Actions | Quick navigation to calendar, reservations, earnings |

### My Listing (`/host/listings`)
| Property | Value |
|----------|-------|
| Purpose | View and manage the single listing |
| User | Venue Host |
| Data | Listing details, status, photos, pricing |
| Actions | Edit listing, manage availability, view analytics |

### Calendar (`/host/listings/[id]/calendar`)
| Property | Value |
|----------|-------|
| Purpose | Visual availability management |
| User | Venue Host |
| Data | Monthly calendar with bookings, availability, blocked dates |
| Actions | Add/edit availability, block dates, view bookings |

### Reservations (`/host/bookings`)
| Property | Value |
|----------|-------|
| Purpose | Manage incoming bookings |
| User | Venue Host |
| Data | List of bookings with status, guest info, dates |
| Actions | Approve, reject, check in, view details, message guest |

### Earnings
| Property | Value |
|----------|-------|
| Purpose | View earnings and payouts |
| User | Venue Host |
| Data | Total earned, pending, released, payout history |
| Actions | Request payout, view breakdown |

### Reviews
| Property | Value |
|----------|-------|
| Purpose | View and respond to reviews |
| User | Venue Host |
| Data | Reviews with ratings, guest info |
| Actions | Respond to review, flag inappropriate review |

### Analytics
| Property | Value |
|----------|-------|
| Purpose | View performance metrics |
| User | Venue Host |
| Data | Booking trends, occupancy, revenue, popular times |
| Actions | Filter by date range, export |

### Verification (`/host/verification`)
| Property | Value |
|----------|-------|
| Purpose | Submit identity/business verification |
| User | Venue Host |
| Data | Current verification status, submitted documents |
| Actions | Upload documents, submit for review |

### Settings
| Property | Value |
|----------|-------|
| Purpose | Account and listing settings |
| User | Venue Host |
| Data | Profile info, notification preferences, payout settings |
| Actions | Edit profile, manage notifications, API keys, webhooks |

## B4. Admin Pages

### Admin Dashboard (`/admin`)
| Property | Value |
|----------|-------|
| Purpose | Platform overview |
| User | Admin |
| Data | Stats (users, listings, bookings, revenue), pending actions |
| Actions | Navigate to review queues |

### Listing Review (`/admin/listings/pending`)
| Property | Value |
|----------|-------|
| Purpose | Review pending listings |
| User | Admin |
| Data | Listing info, photos, provider info, pricing, availability |
| Actions | Approve, reject (with reason), request changes |

### Provider Verification (`/admin/verifications`)
| Property | Value |
|----------|-------|
| Purpose | Review provider verification documents |
| User | Admin |
| Data | Provider info, submitted documents, verification type |
| Actions | Approve, reject (with reason) |

### User Management (`/admin/users`)
| Property | Value |
|----------|-------|
| Purpose | Manage user accounts |
| User | Admin |
| Data | User list with roles, status, verification |
| Actions | View details, suspend, change role |

### Disputes
| Property | Value |
|----------|-------|
| Purpose | Review and resolve disputes |
| User | Admin |
| Data | Dispute details, evidence from both parties |
| Actions | Review evidence, make decision, process refund |

### Audit Trail
| Property | Value |
|----------|-------|
| Purpose | View system audit log |
| User | Admin |
| Data | Filterable list of all audit events |
| Actions | Filter by actor, action, resource, date |

---

# DOCUMENT C: DATA MODEL

## C1. Entity Relationship Overview

```
users (1) ──── (1) provider_profiles
users (1) ──── (N) bookings (as guest)
users (1) ──── (N) reviews (as guest)
users (1) ──── (N) messages (as sender)

provider_profiles (1) ──── (N) listings
provider_profiles (1) ──── (N) provider_verifications

listings (1) ──── (N) listing_media
listings (1) ──── (N) blocked_dates
listings (1) ──── (N) bookings
listings (1) ──── (N) slots
listings (1) ──── (N) exclusive_locks
listings (1) ──── (N) availability_rules
listings (1) ──── (N) reviews

bookings (1) ──── (N) payment_records
bookings (1) ──── (N) booking_transitions
bookings (1) ──── (N) booking_snapshot_audit
bookings (1) ──── (1) disputes (optional)

slots (1) ──── (N) soft_holds

group_plans (1) ──── (N) plan_members
group_plans (1) ──── (1) bookings (finalized)

conversations (1) ──── (N) messages

disputes (1) ──── (N) dispute_evidence
```

## C2. Core Tables — Required Fields

### users
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | Internal ID |
| clerk_id | TEXT | UNIQUE, NOT NULL | Clerk auth ID |
| email | TEXT | NOT NULL | |
| name | TEXT | NOT NULL | Display name |
| role | TEXT | NOT NULL, DEFAULT 'guest' | CHECK: guest, venue_host, housing_agent, admin |
| profile_completed | BOOLEAN | DEFAULT false | |
| avatar_url | TEXT | nullable | |
| phone | TEXT | nullable | |
| timezone | TEXT | DEFAULT 'Africa/Lagos' | |
| status | TEXT | DEFAULT 'active' | CHECK: active, suspended |
| created_at | TIMESTAMPTZ | DEFAULT now() | |

### provider_profiles
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| user_id | UUID | FK→users, UNIQUE, NOT NULL | One profile per user |
| provider_type | TEXT | NOT NULL | venue_host, housing_agent |
| business_type | TEXT | nullable | property_owner (for housing_agent) |
| display_name | TEXT | nullable | |
| business_name | TEXT | nullable | |
| verification_status | TEXT | DEFAULT 'none' | none, pending, verified, rejected, suspended |
| created_at | TIMESTAMPTZ | DEFAULT now() | |

### listings
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| provider_profile_id | UUID | FK→provider_profiles, NOT NULL | |
| listing_type | TEXT | NOT NULL | venue, outdoor_space, shortlet_apartment |
| title | TEXT | NOT NULL | |
| description | TEXT | | |
| location | JSONB | | address, area, city, state, coordinates |
| pricing | JSONB | | rate, currency, pricing_model |
| capacity | INTEGER | nullable | Maximum guest capacity (venue only) |
| booking_modes | TEXT[] | | ['capacity'], ['exclusive'], ['capacity','exclusive'] |
| amenities | TEXT[] | | Structured list |
| rules | TEXT[] | | Structured list |
| status | TEXT | DEFAULT 'draft' | draft, submitted, under_review, approved, rejected, suspended, archived |
| is_active | BOOLEAN | DEFAULT false | True only when status=approved |
| created_at | TIMESTAMPTZ | DEFAULT now() | |

**CONSTRAINT:** One listing per provider_profile_id (enforced at DB level via trigger or unique partial index).

### bookings
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| guest_id | UUID | FK→users, NOT NULL | |
| listing_id | UUID | FK→listings, NOT NULL | |
| host_id | UUID | FK→users, NOT NULL | Denormalized for quick access |
| booking_type | TEXT | NOT NULL | capacity, exclusive, housing |
| status | TEXT | NOT NULL | See state machine (D1) |
| start_date | DATE | NOT NULL | |
| end_date | DATE | NOT NULL | |
| start_time | TIME | nullable | For capacity/exclusive venues |
| end_time | TIME | nullable | For capacity/exclusive venues |
| headcount | INTEGER | DEFAULT 1 | Number of guests |
| total_amount_kobo | INTEGER | NOT NULL | Final amount paid in kobo |
| pricing_snapshot | JSONB | | Exact pricing breakdown at time of booking |
| terms_snapshot | JSONB | | Booking terms accepted |
| payment_reference | TEXT | UNIQUE | Paystack reference |
| confirmed_at | TIMESTAMPTZ | | |
| expires_at | TIMESTAMPTZ | | Auto-expire if unpaid |
| cancelled_at | TIMESTAMPTZ | | |
| cancel_reason | TEXT | | |
| check_in_token | TEXT | | Short-lived rotating token |
| checked_in_at | TIMESTAMPTZ | | |
| created_at | TIMESTAMPTZ | DEFAULT now() | |

### availability_rules
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| listing_id | UUID | FK→listings, NOT NULL | |
| day_of_week | INTEGER | 0-6 (Sun-Sat) | nullable (null = special date) |
| start_time | TIME | NOT NULL | |
| end_time | TIME | NOT NULL | |
| is_active | BOOLEAN | DEFAULT true | |
| date | DATE | nullable | For special dates (non-null overrides day_of_week) |
| label | TEXT | nullable | e.g., "Happy Hour", "Late Night" |
| pricing_override | JSONB | nullable | Special pricing for this rule |

### blocked_dates
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| listing_id | UUID | FK→listings, NOT NULL | |
| start_date | DATE | NOT NULL | |
| end_date | DATE | NOT NULL | |
| start_time | TIME | nullable | null = all day |
| end_time | TIME | nullable | |
| reason | TEXT | DEFAULT 'host_blocked' | host_blocked, booking, maintenance |
| created_at | TIMESTAMPTZ | DEFAULT now() | |

### payment_records
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| booking_id | UUID | FK→bookings, NOT NULL | |
| amount_kobo | INTEGER | NOT NULL | |
| fee_kobo | INTEGER | DEFAULT 0 | Paystack processing fee |
| venue_component_kobo | INTEGER | DEFAULT 0 | |
| platform_component_kobo | INTEGER | DEFAULT 0 | |
| venue_spend_kobo | INTEGER | DEFAULT 0 | Guest's venue-spend entitlement |
| gateway_ref | TEXT | | Paystack transaction reference |
| status | TEXT | DEFAULT 'pending' | pending, processing, successful, failed, refunded |
| created_at | TIMESTAMPTZ | DEFAULT now() | |

### listing_media
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | UUID | PK | |
| listing_id | UUID | FK→listings, NOT NULL | |
| url | TEXT | NOT NULL | |
| media_type | TEXT | DEFAULT 'image' | image, video |
| caption | TEXT | nullable | |
| sort_order | INTEGER | DEFAULT 0 | |
| is_primary | BOOLEAN | DEFAULT false | |
| created_at | TIMESTAMPTZ | DEFAULT now() | |

## C3. Supporting Tables

Existing tables retained: `slots`, `exclusive_locks`, `soft_holds`, `group_plans`, `plan_members`, `booking_transitions`, `booking_snapshot_audit`, `reviews`, `audit_logs`, `provider_verifications`, `processed_webhooks`, `whatsapp_sessions`, `conversations`, `messages`, `message_templates`, `disputes`, `dispute_evidence`, `notifications`, `notification_preferences`, `tenancy_periods`, `escrow_releases`, `documents`, `reports`, `blocked_users`, `content_flags`, `search_analytics`, `calendar_subscriptions`, `export_jobs`, `host_settings`, `account_deletion_requests`, `system_health`, `error_logs`, `uptime_checks`, `request_metrics`, `api_keys`, `api_usage`, `webhook_endpoints`, `webhook_events`, `webhook_deliveries`, `data_retention_policies`, `audit_archive`, `listing_views`.

## C4. Critical Constraints

| Constraint | Table | Type | Purpose |
|-----------|-------|------|---------|
| One listing per provider | listings | Trigger/function | Prevent venue hosts from creating multiple listings |
| Unique booking reference | bookings | UNIQUE | Idempotency |
| Unique payment reference | payment_records | UNIQUE | Idempotency |
| No overlapping exclusive bookings | bookings | EXCLUSION GiST | Prevent double exclusive booking |
| No overlapping slots | slots | EXCLUSION GiST | Prevent capacity over-allocation |
| Booking status CHECK | bookings | CHECK | Enforce valid states |
| Payment status CHECK | payment_records | CHECK | Enforce valid states |
| Listing status CHECK | listings | CHECK | Enforce valid lifecycle |
| Price non-negative | bookings, payment_records | CHECK | Financial integrity |

---

# DOCUMENT D: STATE MACHINES

## D1. Booking State Machine

```
States:
  draft
  pending_approval          (host must approve capacity bookings)
  awaiting_payment          (approved, awaiting guest payment)
  payment_processing        (payment initiated, webhook pending)
  confirmed                 (payment verified, booking active)
  checked_in                (guest has checked in)
  completed                 (booking period ended, host confirmed)
  cancelled_by_guest
  cancelled_by_host
  cancelled_system          (auto-cancel on expiry)
  expired                   (payment deadline passed)
  rejected                  (host rejected the booking)
  lost_race                 (concurrent exclusive conflict)

Allowed Transitions:
  draft ──────────────────> pending_approval    [guest submits]
  draft ──────────────────> awaiting_payment    [exclusive: auto-advance]
  pending_approval ───────> awaiting_payment    [host approves]
  pending_approval ───────> rejected            [host rejects]
  pending_approval ───────> cancelled_by_guest  [guest cancels]
  awaiting_payment ───────> payment_processing  [guest initiates payment]
  awaiting_payment ───────> expired             [timeout: system]
  awaiting_payment ───────> cancelled_by_guest  [guest cancels]
  awaiting_payment ───────> cancelled_by_host   [host cancels]
  payment_processing ─────> confirmed           [webhook: payment verified]
  payment_processing ─────> awaiting_payment    [webhook: payment failed, retry]
  confirmed ──────────────> checked_in          [check-in at venue]
  confirmed ──────────────> completed           [host marks complete]
  confirmed ──────────────> cancelled_by_guest  [guest cancels, per policy]
  confirmed ──────────────> cancelled_by_host   [host cancels]
  confirmed ──────────────> cancelled_system    [system: no-show]
  checked_in ─────────────> completed           [host marks complete]
  confirmed ──────────────> lost_race           [exclusive conflict detected]
```

### Side Effects per Transition

| Transition | Side Effects |
|-----------|-------------|
| pending_approval → awaiting_payment | Notify host of new booking request |
| awaiting_payment → expired | Release soft hold or exclusive lock |
| payment_processing → confirmed | Generate receipt, notify guest + host, create check-in token |
| confirmed → checked_in | Validate token, mark token used |
| confirmed → completed | Trigger escrow release eligibility |
| confirmed → cancelled_by_guest | Calculate refund per policy, process refund |
| confirmed → cancelled_by_host | Notify guest, process refund if applicable |
| Any → rejected | Notify guest |

## D2. Listing State Machine

```
States:
  draft
  submitted
  under_review
  approved
  rejected
  suspended
  archived

Transitions:
  draft ─────────────> submitted           [host submits]
  submitted ─────────> under_review        [admin picks up]
  under_review ──────> approved            [admin approves]
  under_review ──────> rejected            [admin rejects, with reason]
  approved ──────────> suspended           [admin suspends]
  rejected ──────────> draft               [host revises]
  suspended ─────────> draft               [admin or host reactivates]
  draft ─────────────> archived            [host archives]
```

## D3. Payment State Machine

```
States:
  pending
  processing
  successful
  failed
  refunded
  disputed

Transitions:
  pending ──────────> processing           [webhook received]
  processing ───────> successful           [verified]
  processing ───────> failed               [verification failed]
  pending ──────────> failed               [timeout]
  successful ───────> refunded             [refund processed]
  successful ───────> disputed             [dispute filed]
```

## D4. Provider Verification State Machine

```
States on provider_profiles.verification_status:
  none
  pending
  verified
  rejected
  suspended

States on individual provider_verifications:
  pending
  approved
  rejected
  expired

Transitions (profile level):
  none ─────────────> pending              [document submitted]
  pending ──────────> verified             [all required docs approved]
  pending ──────────> rejected             [any doc rejected, no other approved]
  verified ─────────> suspended            [admin suspends]
  rejected ─────────> pending              [new submission]
  suspended ────────> pending              [new submission after appeal]
```

---

# DOCUMENT E: TIME & AVAILABILITY SPECIFICATION

## E1. Core Concepts

### Time Hierarchy
```
Availability Rules (recurring weekly)
  ↓ expanded to →
Date-specific Availability (individual days)
  ↓ modified by →
Special Dates (override recurring + pricing)
  ↓ blocked by →
Blocked Dates (unavailable periods)
  ↓ reserved by →
Bookings (confirmed reservations)
  ↓ remaining →
Available Capacity / Open Slots
```

### Time Representation
- All times stored in `Africa/Lagos` timezone (WAT, UTC+1)
- `start_time` and `end_time` are stored as `TIME` type (not TIMESTAMP)
- Date + time are combined at query time to form `TIMESTAMPTZ` for conflict checks
- Display to user: always in WAT with "WAT" label
- Never depend on browser-local time

### Availability Rule Structure
```json
{
  "listing_id": "uuid",
  "day_of_week": 0-6,
  "start_time": "17:00",
  "end_time": "23:00",
  "label": "Weekday Evening",
  "pricing_override": null
}
```

### Special Date Structure
```json
{
  "listing_id": "uuid",
  "date": "2026-12-25",
  "start_time": "14:00",
  "end_time": "02:00",
  "label": "Christmas Special",
  "pricing_override": {
    "base_rate_kobo": 300000,
    "minimum_hours": 3
  }
}
```

### Blocked Date Structure
```json
{
  "listing_id": "uuid",
  "start_date": "2026-12-25",
  "end_date": "2026-12-25",
  "start_time": null,
  "end_time": null,
  "reason": "host_blocked"
}
```

## E2. Availability Resolution Algorithm

```
function getAvailableSlots(listingId, date):
  1. Get all availability rules for this day_of_week
  2. Get all special dates for this date
  3. If special dates exist, use those instead of recurring rules
  4. Get all blocked_dates that overlap this date
  5. Get all confirmed bookings that overlap this date
  6. Get all exclusive_locks (reserved) that overlap this date
  
  For each availability window:
    a. Subtract blocked periods
    b. If venue supports capacity booking:
       - Calculate remaining capacity at each time slot
       - Subtract confirmed capacity bookings
       - If exclusive booking exists for this period, mark capacity as unavailable
    c. If venue supports exclusive booking:
       - Check exclusive_locks for conflicts
       - Mark as unavailable if lock exists
    d. Return available windows with remaining capacity
```

## E3. Capacity Availability Calculation

```
For a given time T on a given date:

remaining_capacity = max_capacity
  - SUM(booking.headcount) FOR ALL bookings
    WHERE booking.listing_id = X
    AND booking.status IN ('confirmed', 'checked_in')
    AND booking.booking_type = 'capacity'
    AND booking.start_date <= T_date
    AND booking.end_date >= T_date
    AND booking.start_time <= T
    AND booking.end_time > T

available = remaining_capacity > 0
available_count = remaining_capacity
```

## E4. Exclusive Booking Conflict Detection

```
For a requested period [req_start, req_end]:

conflict = EXISTS (
  SELECT 1 FROM bookings
  WHERE listing_id = X
  AND status IN ('confirmed', 'awaiting_payment', 'payment_processing')
  AND booking_type = 'exclusive'
  AND tstzrange(start_date + start_time, end_date + end_time) &&
      tstzrange(req_start, req_end)
)

Also check exclusive_locks:
conflict = EXISTS (
  SELECT 1 FROM exclusive_locks
  WHERE listing_id = X
  AND status = 'reserved'
  AND tstzrange(start_date + start_time, end_date + end_time) &&
      tstzrange(req_start, req_end)
)
```

## E5. Midnight Crossing

Outdoor spaces and late-night venues may have operating hours that cross midnight (e.g., 6 PM – 2 AM).

```
if end_time < start_time:
  window = [start_time, end_time + 24 hours]
  booking spans two calendar dates

Example: 18:00 – 02:00
  = 2026-08-28 18:00 to 2026-08-29 02:00
```

## E6. Buffer/Preparation Time

Currently not required by spec. When needed:
- Add `buffer_minutes` field to availability_rules
- Extend blocked period after each booking by buffer duration
- Prevent back-to-back bookings without gap

## E7. Cancellation Window

```
Cancellation allowed if:
  booking.start_date + booking.start_time > now() + cancellation_notice_hours

cancellation_notice_hours = configurable per listing (default 24)
```

---

# DOCUMENT F: PRICING & PAYMENT SPECIFICATION

## F1. Pricing Engine Architecture

```
One central module: src/lib/pricing/engine.js

Input:
  - listing pricing config
  - booking_type (capacity / exclusive)
  - headcount
  - duration (hours)
  - applicable discounts
  - Paystack fee config

Output:
  {
    base_amount_kobo,
    discount_amount_kobo,
    subtotal_kobo,
    venue_spend_entitlement_kobo,
    venue_component_kobo,
    platform_component_kobo,
    payment_fee_kobo,
    total_amount_kobo,
    currency: "NGN",
    pricing_rule_version
  }
```

## F2. Capacity Pricing Formula

```
base_amount = base_rate_kobo × headcount × hours

discount = calculateDiscount(base_amount, headcount, hours)

subtotal = base_amount - discount

venue_spend_entitlement = venue_spend_rate × headcount × hours

payment_fee = calculatePaystackFee(subtotal)

total_amount = subtotal + payment_fee

venue_component = fixed_venue_rate × headcount × hours

platform_component = subtotal - venue_component

settlement = {
  guest_pays: total_amount,
  venue_spend: venue_spend_entitlement,
  venue_gets: venue_component,
  platform_gets: platform_component,
  paystack_gets: payment_fee
}
```

## F3. Exclusive Pricing Formula

```
base_amount = exclusive_rate_kobo × hours

discount = calculateExclusiveDiscount(base_amount, hours)

subtotal = base_amount - discount

payment_fee = calculatePaystackFee(subtotal)

total_amount = subtotal + payment_fee

// No per-person venue-spend for exclusive (entire space reserved)
```

## F4. Discount Rules

```
Multi-Guest Discount:
  - Applies when headcount >= 2
  - Discount percentage: configurable (e.g., 5% for 2-4, 10% for 5+)
  - Only affects base_amount, NOT payment_fee

Multi-Hour Discount:
  - Applies when hours >= 3
  - Discount percentage: configurable (e.g., 10% for 3+ hours)
  - Only affects base_amount, NOT payment_fee

Combined Discount:
  - If both apply, apply multi-hour first, then multi-guest on the result
  - Or apply single combined discount (configurable)

Payment Fee:
  - Calculated on the post-discount subtotal
  - Never discounted
```

## F5. Paystack Fee Calculation (Configurable)

```
fee_config = {
  percentage: 1.5,           // 1.5%
  flat_fee_kobo: 10000,      // ₦100
  waiver_threshold_kobo: 250000, // ₦2,500 (no flat fee below this)
  cap_kobo: 200000,          // ₦2,000 maximum fee
  charge_to_customer: true   // whether to add fee to guest total
}

calculatePaystackFee(amount_kobo):
  fee = (amount_kobo × percentage / 100) + flat_fee_kobo
  if amount_kobo < waiver_threshold:
    fee = amount_kobo × percentage / 100  // waive flat fee
  fee = min(fee, cap_kobo)
  if charge_to_customer:
    return fee  // added to guest total
  else:
    return 0    // absorbed by platform
```

## F6. Venue-Spend Entitlement

```
venue_spend_rate = configurable (e.g., 100000 kobo = ₦1,000 per guest/hour)

displayed to guest as: "Includes ₦1,000 venue spend"

NOT a wallet. NOT refundable. NOT tracked by ClockHost.
Guest can spend more — handled directly with venue.
Unused entitlement expires with booking.
```

## F7. Pricing Snapshot (at checkout)

```json
{
  "base_rate_kobo": 200000,
  "headcount": 2,
  "hours": 3,
  "base_amount_kobo": 1200000,
  "discount_amount_kobo": 120000,
  "subtotal_kobo": 1080000,
  "venue_spend_entitlement_kobo": 600000,
  "venue_component_kobo": 300000,
  "platform_component_kobo": 780000,
  "payment_fee_kobo": 16200,
  "total_amount_kobo": 1096200,
  "currency": "NGN",
  "pricing_rule_version": "1.0",
  "calculated_at": "2026-08-28T17:00:00Z"
}
```

## F8. Host Earnings Breakdown

```
For each completed booking:
  venue_component_kobo = what the venue earns
  platform_component_kobo = what ClockHost earns
  payment_fee_kobo = Paystack's fee
  venue_spend_kobo = guest's venue-spend (not tracked by ClockHost)

Earnings display:
  Total earned: ₦X
  Per booking: venue_component + platform_component
  Payout: after escrow release
```

---

# DOCUMENT G: AUTHORIZATION MATRIX

## G1. Guest Actions

| Action | Auth Required | Condition |
|--------|--------------|-----------|
| Browse listings | No | Public |
| View listing details | No | Public (active listings only) |
| Check availability | No | Public |
| Create booking | Yes | profile_completed = true, not suspended |
| Initiate payment | Yes | Owns booking, status = awaiting_payment |
| Cancel booking | Yes | Owns booking, within cancellation window |
| Check in | Yes | Owns booking, valid token, not expired |
| Leave review | Yes | Owns completed booking |
| View booking details | Yes | Owns booking |
| View booking history | Yes | Guest role |
| Upload payment evidence | Yes | Owns booking |
| Manage profile | Yes | Own account |
| Send message | Yes | Authenticated |

## G2. Venue Host Actions

| Action | Auth Required | Condition |
|--------|--------------|-----------|
| Create listing | Yes | venue_host role, no existing listing |
| Edit own listing | Yes | Owns listing |
| Delete own listing | Yes | Owns listing, status ≠ active |
| Configure availability | Yes | Owns listing |
| Block dates | Yes | Owns listing |
| Approve booking | Yes | Owns listing, booking.status = pending_approval |
| Reject booking | Yes | Owns listing, booking.status = pending_approval |
| Check in guest | Yes | Owns listing, valid token |
| Complete booking | Yes | Owns listing, booking.status = confirmed |
| Cancel booking | Yes | Owns listing, within policy |
| Release escrow | Yes | Owns listing, booking.status = completed |
| Respond to review | Yes | Owns listing |
| View earnings | Yes | venue_host role |
| Submit verification | Yes | venue_host role, no duplicate pending |
| Manage messages | Yes | Authenticated |

## G3. Shortlet Apartment Host Actions

| Action | Auth Required | Condition |
|--------|--------------|-----------|
| Create property | Yes | housing_agent role |
| Edit own property | Yes | Owns property |
| Manage viewing requests | Yes | Owns property |
| Process booking | Yes | Owns property |
| Upload documents | Yes | Owns property |
| Handle disputes | Yes | Owns property |

## G4. Admin Actions

| Action | Auth Required | Condition |
|--------|--------------|-----------|
| Review providers | Yes | admin role |
| Approve/reject verification | Yes | admin role |
| Approve/reject listings | Yes | admin role |
| Suspend listings | Yes | admin role |
| Suspend providers | Yes | admin role |
| Review bookings | Yes | admin role |
| Review payments | Yes | admin role |
| Process refunds | Yes | admin role |
| Review disputes | Yes | admin role |
| View audit trail | Yes | admin role |
| View monitoring | Yes | admin role |
| Manage users | Yes | admin role |

## G5. Server-Side Enforcement

Every protected action must check authorization in this order:
1. **Authentication**: Is the user logged in? (session cookie valid)
2. **Role**: Does the user have the required role?
3. **Ownership**: Does the user own the resource?
4. **State**: Is the resource in the correct state for this action?
5. **Business rules**: Are all business conditions met?

Frontend role gates are for UX only — never for security.

---

# DOCUMENT H: EDGE-CASE MATRIX

| # | Scenario | Expected Behavior |
|---|----------|------------------|
| 1 | Two users try to book last 2 seats simultaneously | One succeeds, one gets "unavailable" error. Atomic operation prevents double booking. |
| 2 | Payment succeeds but webhook confirmation fails | Booking stays in payment_processing. Retry via Paystack verification API. |
| 3 | Payment initiated but abandoned | Booking expires after timeout. Soft hold/lock released. |
| 4 | Payment callback arrives twice | Idempotency via processed_webhooks unique constraint. Second callback returns "already processed". |
| 5 | Payment callback arrives late (after expiry) | If booking expired: reject webhook, refund if charged. If booking still pending: process normally. |
| 6 | Booking expires | System auto-cancels. Releases hold/lock. Notifies guest. |
| 7 | Host changes availability during pending booking | No effect on existing pending/confirmed bookings. Changes apply to new bookings only. |
| 8 | Host changes price after guest starts checkout | Price is locked at checkout initiation via pricing_snapshot. Guest sees original price. |
| 9 | Guest changes booking quantity during checkout | Not allowed after pricing snapshot is created. Must start new booking. |
| 10 | Exclusive booking conflicts with capacity booking | Exclusive blocks overlapping capacity. Capacity bookings in non-overlapping windows remain available. |
| 11 | Capacity becomes full during checkout | Soft hold reserves capacity. If hold expires before payment, capacity reopens. |
| 12 | Host cancels confirmed booking | Notify guest. Process refund per cancellation policy. Release any holds. |
| 13 | Guest cancels confirmed booking | Check cancellation window. Calculate refund per policy. Process refund. |
| 14 | Partial refund needed | Calculate exact refund amount server-side. Process via Paystack. Record in payment_records. |
| 15 | Booking rejected by host | Notify guest. No charge. Mark as rejected. |
| 16 | Host does not respond to pending booking | Auto-reject after configurable timeout (e.g., 48 hours). Notify guest. |
| 17 | Duplicate form submission (double-click) | Idempotency key prevents duplicate booking creation. |
| 18 | Expired verification token | Check-in rejected. Guest must request new token from host. |
| 19 | Unauthorized booking access | 403 Forbidden. No booking details exposed. |
| 20 | Deleted/unpublished listing with existing booking | Booking remains valid. Listing status does not affect existing confirmed bookings. |
| 21 | Image unavailable | Show placeholder. Log error. Do not crash page. |
| 22 | Network failure during checkout | Guest sees error. No payment charged (payment not initiated). Retry possible. |
| 23 | Browser refresh during checkout | Pricing snapshot preserved. Guest can continue from where they left off. |
| 24 | Concurrent exclusive lock creation | Atomic DB operation. Only one lock wins. Other receives "time slot just booked". |
| 25 | Midnight-crossing booking | Time engine correctly handles end_time < start_time by spanning two dates. |
| 26 | Group booking owner tries to inflate count | Paid quantity fixed at payment time. Additional participants don't increase paid amount. |
| 27 | Host tries to create second listing | Backend rejects. One listing per venue host enforced at DB level. |
| 28 | Guest tries to book without completing profile | Server rejects. Profile completion required before booking. |
| 29 | Admin approves listing with invalid data | Admin review screen shows all data. Admin is responsible for validating before approval. |
| 30 | Refund exceeds original payment | System prevents. Refund amount ≤ original payment amount. |

---

# DOCUMENT I: EXISTING-CODE AUDIT

## I1. What Already Works and Should Be Retained

| Component | Status | Action |
|-----------|--------|--------|
| Clerk authentication | ✅ Working | Retain |
| Provider profiles table | ✅ Working | Retain |
| Provider verifications table | ✅ Working | Retain |
| Listings CRUD | ✅ Working | Modify (add listing_type, enforce one-per-host) |
| Booking state machine | ✅ Working | Modify (add missing states, fix concurrency) |
| Group booking finalization | ✅ Working | Retain |
| Exclusive lock resolution | ✅ Working | Modify (fix error handling) |
| Paystack integration | ✅ Working | Modify (add verifyTransaction call) |
| Webhook processing | ✅ Working | Modify (make transactional) |
| Search with PostGIS | ✅ Working | Retain |
| RLS on all tables | ✅ Working | Modify (add missing policies) |
| Audit logging | ✅ Working | Retain |
| WhatsApp bot | ✅ Working | Retain |
| Notification system | ⚠️ Partial | Modify (centralize, fix broken notifications) |
| Media handling | ⚠️ Partial | Modify (ensure consistent display everywhere) |
| Admin approval | ⚠️ Partial | Modify (add reason to suspend, fix response helpers) |
| Pricing calculation | ⚠️ Partial | Modify (centralize, add venue-spend, discounts) |
| Availability engine | ⚠️ Partial | Modify (add availability_rules table, structured schedule) |
| Profile completion | ⚠️ Partial | Modify (role-specific forms, fix redirects) |

## I2. What Must Be Modified

| Component | Issue | Fix |
|-----------|-------|-----|
| Booking creation | Race condition on soft hold conversion | Use atomic DB operation |
| Exclusive lock creation | Race condition | Use atomic DB operation |
| State machine | No concurrency protection | Add SELECT FOR UPDATE or optimistic locking |
| Pricing | Scattered in 4 places | Centralize in pricing engine |
| Commission | Hardcoded 5% | Make configurable |
| Cancel notification | Missing host_id | Fix join to get host |
| CSRF | Missing on approve/reject/complete | Add CSRF validation |
| Dashboard | No role gate | Add RoleGate or server check |
| Middleware | No auth-based routing | Add auth enforcement |
| Complete-profile | Hardcoded redirect | Use getRedirectPath |
| Listing statuses | Missing under_review | Add to CHECK constraint |
| Booking statuses | Missing no_show, expired, lost_race | Add to CHECK constraint |

## I3. What Must Be Removed

| Component | Reason |
|-----------|--------|
| /api/debug/db route | Exposes DB info, security risk |
| Dead booking.js functions | Superseded by API routes |
| Dead exclusive.js markWebhookProcessing | Not used |
| "HostMe" references | Replaced by ClockHost |
| "vertical" terminology in UI | Replace with product terms |

## I4. What Must Be Newly Introduced

| Component | Reason |
|-----------|--------|
| availability_rules table | Structured recurring schedule |
| One-listing-per-host DB constraint | Business rule enforcement |
| Pricing engine module | Central pricing calculation |
| Venue-spend entitlement | Product requirement |
| Check-in token system | Security requirement |
| Booking receipt generation | Product requirement |
| Central notification service | Consistency requirement |
| Role-specific profile forms | Product requirement |
| Outdoor Space listing workflow | New listing type |
| Housing monthly pricing model | Product requirement |
| Viewing workflow | Product requirement |

---

# DOCUMENT J: DEPENDENCY REVIEW (52 TASKS)

## Phase 1: Critical Safety

| Task | Dependencies | Affected Tables | Affected Routes | Risk | Status |
|------|-------------|----------------|----------------|------|--------|
| 1. Atomic booking creation | None | bookings, soft_holds | POST /bookings | HIGH — must fix first | ✅ Correct |
| 2. Atomic exclusive lock | None | exclusive_locks, bookings | POST /exclusive/request | HIGH — must fix first | ✅ Correct |
| 3. Idempotency keys | #1, #2 | bookings | POST /bookings, /exclusive/request | HIGH | ✅ Correct |
| 4. Transactional webhook | None | processed_webhooks, bookings | POST /webhook/paystack | HIGH | ✅ Correct |
| 5. Missing DB statuses | None | bookings, payment_records | Multiple | HIGH | ✅ Correct |
| 6. Add host_id to bookings | #5 | bookings | POST /bookings, cancel | MEDIUM | ✅ Correct |
| 7. Fix cancel notification | #6 | bookings, notifications | POST /bookings/[id]/cancel | MEDIUM | ✅ Correct |
| 8. Add CSRF to mutations | None | None | approve, reject, complete, initiate | MEDIUM | ✅ Correct |
| 9. Fix resolveExclusiveLock | None | bookings | exclusive.js | MEDIUM | ✅ Correct |
| 10. Call verifyTransaction | None | payment_records | webhook handler | MEDIUM | ✅ Correct |

## Phase 2: Core Product Gaps

| Task | Dependencies | Affected Tables | Affected Routes | Risk | Status |
|------|-------------|----------------|----------------|------|--------|
| 11. One-listing-per-host DB constraint | None | listings | POST /listings | HIGH | ✅ Correct |
| 22. Venue-spend entitlement | None | pricing_snapshot | Pricing engine | MEDIUM | ✅ Correct |
| 12. Configurable commission | None | payment_records | Pricing engine | MEDIUM | ✅ Correct |
| 13. Multi-guest discount | #12 | pricing_snapshot | Pricing engine | MEDIUM | ✅ Correct |
| 14. Multi-hour discount | #12 | pricing_snapshot | Pricing engine | MEDIUM | ✅ Correct |
| 15. Paystack fee calculation | #12 | payment_records | Pricing engine | MEDIUM | ✅ Correct |
| 16. Pricing snapshot breakdown | #12-15 | pricing_snapshot | Checkout, receipt | MEDIUM | ✅ Correct |
| 17. Receipt generation | #16 | documents | New route | LOW | ✅ Correct |
| 18. Outdoor Space flow | #11 | listings, availability_rules | New routes | HIGH | ✅ Correct |
| 19. Structured venue description | None | listings | Listing form | LOW | ✅ Correct |

## Phase 3: Auth & Route Protection

| Task | Dependencies | Affected Tables | Affected Routes | Risk | Status |
|------|-------------|----------------|----------------|------|--------|
| 20. Middleware auth enforcement | None | None | middleware.js | HIGH | ✅ Correct |
| 21. Fix booking bypass | #20 | None | Homepage, listing pages | HIGH | ✅ Correct |
| 22. Role gate on dashboard | #20 | None | /dashboard | MEDIUM | ✅ Correct |
| 23. Role gate on all protected routes | #20 | None | Multiple | MEDIUM | ✅ Correct |
| 24. Fix complete-profile redirect | None | None | complete-profile/route.js | LOW | ✅ Correct |

## Phase 4: Housing & Viewing

| Task | Dependencies | Affected Tables | Affected Routes | Risk | Status |
|------|-------------|----------------|----------------|------|--------|
| 25. Housing listing flow | #11 | listings | New housing routes | HIGH | ✅ Correct |
| 26. Lease duration options | #25 | listings.pricing | Housing form | MEDIUM | ✅ Correct |
| 27. Viewing workflow | #25 | viewings | New viewing routes | MEDIUM | ✅ Correct |
| 28. Viewing fee | #27 | payment_records | Viewing payment | MEDIUM | ✅ Correct |

## Phase 5: Admin & Notifications

| Task | Dependencies | Affected Tables | Affected Routes | Risk | Status |
|------|-------------|----------------|----------------|------|--------|
| 29. Provider notification on approval | None | notifications | Admin approval routes | LOW | ✅ Correct |
| 30. Fix booking cancel notification | #6, #7 | notifications | Cancel route | MEDIUM | ✅ Correct |
| 31. Wire notification preferences | None | notification_preferences | Notification service | LOW | ✅ Correct |
| 32. Admin audit trail view | None | audit_logs | New admin page | LOW | ✅ Correct |
| 33. Auto-suspension thresholds | None | users, audit_logs | New service | MEDIUM | ✅ Correct |
| 34. Reason on admin suspension | None | listings | Suspend route | LOW | ✅ Correct |

## Phase 6: Testing & Cleanup

| Task | Dependencies | Affected Files | Risk | Status |
|------|-------------|---------------|------|--------|
| 35. API route tests | All prior phases | tests/ | HIGH | ✅ Correct |
| 36. State machine tests | Phase 1 | tests/ | HIGH | ✅ Correct |
| 37. Pricing tests | Phase 2 | tests/ | HIGH | ✅ Correct |
| 38. Authorization tests | Phase 3 | tests/ | HIGH | ✅ Correct |
| 39. Concurrency tests | Phase 1 | tests/ | HIGH | ✅ Correct |
| 40. Remove dead code | None | booking.js, exclusive.js | LOW | ✅ Correct |
| 41. Consolidate DB access | None | Multiple lib files | MEDIUM | ✅ Correct |
| 42. Standardize response helpers | None | Multiple routes | LOW | ✅ Correct |
| 43. Remove debug route | None | /api/debug/db | LOW | ✅ Correct |
| 44. Enable RLS on whatsapp_sessions | None | whatsapp_sessions | LOW | ✅ Correct |

## Phase 7: UI & UX

| Task | Dependencies | Affected Files | Risk | Status |
|------|-------------|---------------|------|--------|
| 45. Structured venue description | #19 | Listing form components | LOW | ✅ Correct |
| 46. Pricing breakdown UI | #16 | Checkout, booking pages | MEDIUM | ✅ Correct |
| 47. Venue-spend display | #22 | Listing, checkout, receipt | LOW | ✅ Correct |
| 48. Admin review UI with photos | None | Admin pages | LOW | ✅ Correct |
| 49. Group booking share view | None | New component | LOW | ✅ Correct |
| 50. Check-in token system | None | New routes, check-in flow | MEDIUM | ✅ Correct |
| 51. Dashboard per listing type | #18 | Host dashboard | MEDIUM | ✅ Correct |
| 52. Listing lifecycle UI | #11, #18 | Listing form, admin pages | MEDIUM | ✅ Correct |

## Dependency Issues Found

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | Task 6 (host_id on bookings) depends on Task 5 (status CHECK update) | ✅ Already ordered correctly |
| 2 | Task 16 (pricing snapshot) depends on Tasks 12-15 (pricing engine) | ✅ Already ordered correctly |
| 3 | Task 18 (Outdoor Space) depends on Task 11 (one-listing-per-host) | ✅ Already ordered correctly |
| 4 | Task 21 (booking bypass) depends on Task 20 (middleware auth) | ✅ Already ordered correctly |
| 5 | **NEW: Task 30 (fix cancel notification) is listed twice — once in Phase 1 (Task 7) and once in Phase 5 (Task 30)** | Merge into single task in Phase 1 |
| 6 | **NEW: availability_rules table must be created before Task 18 (Outdoor Space)** | Add migration to Phase 2 |

## Corrected Task List

Task 30 in Phase 5 is a duplicate of Task 7 in Phase 1. Remove from Phase 5.

Task 18 (Outdoor Space) requires a new `availability_rules` table migration. Add to Phase 2 before Task 18.

All other tasks are correctly ordered and dependency-free.

---

# DESIGN GATE STATUS

| Document | Status |
|----------|--------|
| A. Product/System Map | ✅ Complete |
| B. UX/UI Map | ✅ Complete |
| C. Data Model | ✅ Complete |
| D. State Machines | ✅ Complete |
| E. Time & Availability | ✅ Complete |
| F. Pricing & Payment | ✅ Complete |
| G. Authorization Matrix | ✅ Complete |
| H. Edge-Case Matrix | ✅ Complete |
| I. Existing-Code Audit | ✅ Complete |
| J. Dependency Review | ✅ Complete |

**AWAITING: User review and approval before any coding begins.**
