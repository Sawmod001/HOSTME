# ClockHost — Master Remodel Blueprint
## Single Source of Truth | DO NOT CODE UNTIL THIS IS COMPLETE

> **Status:** IN PROGRESS — Awaiting remaining sections from user
> **Last updated:** 2026-08-28
> **Rule:** This document is the AUTHORITATIVE guide. Every coding decision must trace back here.

---

## TABLE OF CONTENTS

1. [Product Language](#1-product-language)
2. [Core Account Structure](#2-core-account-structure)
3. [Venue Host](#3-venue-host)
4. [Venue Host Listing Limit](#4-venue-host-listing-limit)
5. [Listing Type](#5-listing-type)
6. [Venue Listing](#6-venue-listing)
7. [Outdoor Space Listing](#7-outdoor-space-listing)
8. [Venue Booking Modes](#8-venue-booking-modes)
9. [Capacity Booking](#9-capacity-booking)
10. [Time Engine](#10-time-is-a-first-class-system-concept)
11. [Venue Host Availability](#11-venue-host-availability)
12. [Time Periods for Outdoor Space](#12-time-periods-for-outdoor-space)
13. [Venue Description](#13-venue-description)
14. [Food and Drinks](#14-food-and-drinks)
15. [Capacity Pricing Model](#15-capacity-pricing-model)
16. [Venue-Spend Entitlement](#16-venue-spend-entitlement)
17. [Paystack Fees](#17-paystack-fees)
18. [Payment Splits](#18-payment-splits)
19. [Multi-Guest Capacity Booking](#19-multi-guest-capacity-booking)
20. [Discount Rule](#20-discount-rule)
21. [Multi-Hour Bookings](#21-multi-hour-bookings)
22. [Group Booking](#22-group-booking)
23. [Group Booking Sharing](#23-group-booking-sharing)
24. [Group Check-In](#24-group-check-in)
25. [Booking Security](#25-booking-security)
26. [Exclusive Venue Booking](#26-exclusive-venue-booking)
27. [Outdoor Space Exclusive Booking](#27-outdoor-space-exclusive-booking)
28. [Availability Engine — Atomic Booking](#28-availability-engine--atomic-booking)
29. [Payment and Booking State](#29-payment-and-booking-state)
30. [Idempotency](#30-idempotency)
31. [Booking Snapshot](#31-booking-snapshot)
32. [Receipt / Booking Evidence](#32-receipt--booking-evidence)
33. [Images](#33-images)
34. [Complete Profile — Guest](#34-complete-profile--guest)
35. [Complete Profile — Venue Host](#35-complete-profile--venue-host)
36. [Venue Listing Information](#36-venue-listing-information)
37. [Outdoor Space Listing Information](#37-outdoor-space-listing-information)
38. [Shortlet Apartment Host](#38-shortlet-apartment-host)
39. [Housing Agent vs Property Owner](#39-housing-agent-vs-property-owner)
40. [Housing Listings](#40-housing-listings)
41. [Housing Price/Duration](#41-housing-priceduration)
42. [Housing Viewing](#42-housing-viewing)
43. [Viewing Fee](#43-viewing-fee)
44. [Housing Payment Evidence](#44-housing-payment-evidence)
45. [Agent Undertaking / Documents](#45-agent-undertaking--documents)
46. [Admin](#46-admin)
47. [Listing Approval](#47-listing-approval)
48. [Provider Verification](#48-provider-verification)
49. [Automatic Suspension](#49-automatic-suspension)
50. [Audit Log](#50-audit-log)
51. [Authentication and Authorization](#51-authentication-and-authorization)
52. [Database Security](#52-database-security)
53. [Server Authority](#53-server-authority)
54. [Database Constraints](#54-database-constraints)
55. [Media Architecture](#55-media-architecture)
56. [Product UX Principle](#56-product-ux-principle)
57. [Dashboard — Venue Host](#57-dashboard--venue-host)
58. [Dashboard — Shortlet Apartment Host](#58-dashboard--shortlet-apartment-host)
59. [Listing-Specific Dashboards](#59-listing-specific-dashboards)
60. [Complete Profile Routing](#60-complete-profile-routing)
61. [Fix Booking Bypass](#61-fix-the-current-booking-bypass)
62. [Route Protection](#62-route-protection)
63. [Form Validation](#63-form-validation)
64. [Domain Enums](#64-domain-enums)
65. [Avoid Pattern-Matching Engineering](#65-avoid-pattern-matching-engineering)
66. [Shared vs Specialized Architecture](#66-shared-vs-specialized-architecture)
67. [Time Engine Module](#67-time-engine-module)
68. [Money Engine Module](#68-money-engine-module)
69. [Pricing Snapshot](#69-pricing-snapshot)
70. [Error Handling](#70-error-handling)
71. [Concurrency](#71-concurrency)
72. [Cancellation](#72-cancellation)
73. [Refunds](#73-refunds)
74. [Disputes](#74-disputes)
75. [Communication](#75-communication)
76. [Notifications](#76-notifications)
77. [Observability](#77-observability)
78-XX. [PENDING — More sections coming](#pending)

---

## SECTION 1: PRODUCT LANGUAGE

**Product name:** ClockHost

**BANNED terms (never use in active code, UI, metadata, emails, receipts, documents, notifications, SEO, routes, copy):**
- HostMe
- Host Me
- hostme
- host_me

**BANNED AI/generic jargon:**
- vertical
- entity
- ecosystem
- experience layer
- service vertical
- generic provider type

**Use:** Clear human language an ordinary Nigerian customer, host, or admin can understand.

---

## SECTION 2: CORE ACCOUNT STRUCTURE

**Account roles (DO NOT add more):**
```
Guest
Venue Host
Shortlet Apartment Host
    ├── Housing Agent
    └── Property Owner
Admin
```

**RULE:** Do NOT introduce multi-role account architecture. A provider chooses ONE applicable role during onboarding.

---

## SECTION 3: VENUE HOST

A Venue Host manages a physical place customers can visit or reserve.

**NOT:** event planner, hospitality business, restaurant operator, karaoke provider, football pitch provider, generic event organizer.

**May manage:** lounge, bar, club, leisure/entertainment venue, similar customer-facing venue, other approved venue type.

The venue determines what it offers. Karaoke is NOT a provider type — it's a venue attribute.

---

## SECTION 4: VENUE HOST LISTING LIMIT

**ENFORCE AT DATABASE LEVEL:**
- A Venue Host can manage exactly ONE listing
- The listing is either Venue OR Outdoor Space
- Cannot create both
- Cannot create Venue A + Venue B
- Backend must reject invalid second listing — frontend hiding is insufficient

---

## SECTION 5: LISTING TYPE

When Venue Host begins listing creation:
```
What are you listing?
[ Venue ]
[ Outdoor Space ]
```
This is the listing type, NOT another provider role.

---

## SECTION 6: VENUE LISTING

Represents a physical place customers can visit.

**Examples:** Lounge, Bar, Club, Leisure/entertainment venue, Other approved venue category.

Offerings (karaoke, food, football viewing, music) are listing attributes, NOT separate listing types.

---

## SECTION 7: OUTDOOR SPACE LISTING

Separate listing type under Venue Host. Open area for parties, gatherings, recreation, private events, celebrations.

**RULES:**
- EXCLUSIVE BOOKING ONLY
- No per-person capacity booking
- No capacity inventory model

---

## SECTION 8: VENUE BOOKING MODES

A Venue may support:
- **Capacity Booking** — customers reserve places for themselves/guests
- **Exclusive Booking** — customers reserve entire venue for private use

May support one or both. System must never assume both.

---

## SECTION 9: CAPACITY BOOKING

**Capacity =** Maximum guest capacity (NOT "head count" in UI)

**Calculation example:**
```
Max capacity = 50
Bookings: 10 guests 6-8 PM, 15 guests 7-9 PM
At 7:30 PM: 50 - 10 - 15 = 25 remaining
```
Must consider actual time overlap.

---

## SECTION 10: TIME ENGINE

**NOT a calendar-only system.** Requires proper Availability + Time Engine.

Every bookable period must have: date, start_time, end_time, timezone.

**Timezone:** Africa/Lagos (do not depend on browser-local time)

**Must handle:**
- Opening/closing hours
- Booking windows
- Min/max duration
- Blocked periods
- Exclusive reservations
- Capacity reservations
- Overlapping reservations
- Buffer/preparation time
- Cancellation windows
- Check-in windows
- Expiration
- Special dates
- Recurring schedules
- Exceptional dates

---

## SECTION 11: VENUE HOST AVAILABILITY

**Example:**
```
Monday    5:00 PM – 11:00 PM
Tuesday   5:00 PM – 11:00 PM
Friday    6:00 PM – 1:00 AM
Saturday  2:00 PM – 1:00 AM
```

**Special dates override normal schedule:**
```
Friday, 18 December  6:00 PM – 2:00 AM  Special pricing
```

**Host must be able to:** add, edit, remove availability, create exceptions, block periods, reopen blocked periods, view existing bookings, understand conflicts before saving.

---

## SECTION 12: TIME PERIODS FOR OUTDOOR SPACE

Customer-friendly labels: Morning, Afternoon, Evening, Night, Afternoon + Evening, etc.

**Underlying booking always uses actual start/end datetime.**

Example: Guest sees "Evening 5:00 PM – 9:00 PM", ClockHost stores actual time.

---

## SECTION 13: VENUE DESCRIPTION

**NO single giant free-text box.** Use structured sections:

1. **About this venue** — what it is
2. **What you can do here** — activities
3. **Amenities** — facilities
4. **Food & Drinks** — what's available (ClockHost ≠ food order)
5. **Venue rules** — restrictions, requirements
6. **Booking information** — capacity, mode, times, pricing, cancellation

---

## SECTION 14: FOOD AND DRINKS

**ClockHost does NOT process food/drink orders.**

Venue may display offerings but: ClockHost booking ≠ food order.

Additional purchases happen directly between guest and venue.

---

## SECTION 15: CAPACITY PRICING MODEL

**Reference pricing:** ₦2,000 per guest per hour

**Breakdown:**
```
Guest payment:                ₦2,000
Guest venue-spend entitlement: ₦1,000
Remaining settlement pool:     ₦1,000
  Venue component:              ₦500
  ClockHost component:          ₦500 (after payment processing)
```

**RULES:**
- Do NOT hard-code ₦2,000 as only possible price
- Do NOT calculate venue component as percentage — fixed at ₦500 per guest/hour under reference model
- Design pricing engine so values change through controlled configuration

---

## SECTION 16: VENUE-SPEND ENTITLEMENT

**Customer-facing:** "Includes ₦1,000 venue spend"

**NOT:**
- ClockHost holding ₦1,000 for guest
- Individual food/drink wallet
- Refundable if unused
- Tracked as balance

Guest can spend more than entitlement. Extra = direct with venue. Unused = expires.

---

## SECTION 17: PAYSTACK FEES

**Current (configurable):** 1.5% + ₦100
- ₦100 waived for transactions below ₦2,500
- Fee capped at ₦2,000
- Fees can be passed to customer

**RULE:** Create central payment calculation/service layer. Never scatter fee logic. Server calculates final amount. Frontend never determines payable amount.

---

## SECTION 18: PAYMENT SPLITS

Paystack supports splits between platform and subaccounts.

**System must record:**
- Gross booking amount
- Venue-spend entitlement
- Venue component
- ClockHost component
- Payment processing fee
- Discount
- Final amount paid
- Paystack transaction reference
- Settlement status
- Refund amount
- Refund status

**RULE:** Never derive historical records from today's pricing. Preserve exact financial snapshot at creation time.

---

## SECTION 19: MULTI-GUEST CAPACITY BOOKING

Guest books for 1, 2, 3, 4... guests subject to available capacity.

Price = guest count × duration × configured pricing - discounts.

System must reject bookings exceeding remaining capacity (backend enforced).

---

## SECTION 20: DISCOUNT RULE

**Discount starts at 2 guests** (not 3).

Supports: multi-guest discount, multi-hour discount, combined rules.

Server produces final authoritative amount. No client-side discount calculations.

---

## SECTION 21: MULTI-HOUR BOOKINGS

Guest can book 7-8 PM or 7-10 PM etc. Longer bookings may receive discounts.

**System must show customer before payment:**
- Base amount
- Discount
- Venue-spend entitlement
- Applicable payment fee
- Total

---

## SECTION 22: GROUP BOOKING

**For Capacity Booking ONLY.** Not for Outdoor Space exclusive booking.

ONE booking, ONE owner, ONE payer, ONE payment, MULTIPLE attendees.

Other attendees do NOT make separate payments/bookings.

---

## SECTION 23: GROUP BOOKING SHARING

**Safe to share:** venue, date, time, guest count, status, check-in instructions

**NEVER expose:** payment secrets, private account info, credentials, sensitive data, internal IDs

Shared view is read-only unless product explicitly allows action.

---

## SECTION 24: GROUP CHECK-IN

Booking owner/payer = primary holder.

Venue verifies attendees against group booking.

**Verification token must:** expire, not be predictable, not be reusable indefinitely, not expose sensitive info, be validated server-side.

---

## SECTION 25: BOOKING SECURITY

**NOT a static screenshot.** Use server-verifiable booking status.

**Check-in verifies ALL of:**
- Booking exists
- Booking belongs to venue
- Date/time is valid
- Booking is paid/confirmed
- Not cancelled
- Token is valid
- Attendee hasn't already checked in

---

## SECTION 26: EXCLUSIVE VENUE BOOKING

Reserves venue for selected period.

If confirmed 7-11 PM: capacity booking NOT available 7-11 PM, but MAY be available 4-7 PM.

**DO NOT** automatically block entire calendar day.

---

## SECTION 27: OUTDOOR SPACE EXCLUSIVE BOOKING

Exclusive model only. No capacity booking.

**Host controls:** available dates, periods, actual start/end times, min/max duration, special dates, blocked periods, pricing.

---

## SECTION 28: AVAILABILITY ENGINE — ATOMIC BOOKING

Booking creation must be atomic.

**DO NOT:** check → wait → create (race condition)

Two customers must not reserve same unavailable capacity.

**Booking states:**
```
draft → pending_payment → payment_processing → confirmed
                                                  ↓
                                              cancelled
                                              expired
                                              rejected
                                              completed
                                              no_show
```

---

## SECTION 29: PAYMENT AND BOOKING STATE

**RULE:** Booking does NOT become confirmed because frontend redirected to success page.

Authoritative status = verified server-side payment confirmation/webhook.

Never trust amount/status/success from browser.

---

## SECTION 30: IDEMPOTENCY

**Mandatory.** Same payment callback arriving twice must NOT:
- Create two bookings
- Credit twice
- Create two receipts
- Send duplicate settlement

Use unique references/constraints.

---

## SECTION 31: BOOKING SNAPSHOT

Confirmed booking preserves commercial terms as snapshot.

Later changes to price, description, cancellation policy, availability, amenities, rules do NOT affect existing confirmed bookings.

---

## SECTION 32: RECEIPT / BOOKING EVIDENCE

**Must include:**
- ClockHost branding
- Booking reference
- Guest name
- Venue/listing name
- Date, start/end time
- Guest count
- Booking type
- Pricing breakdown
- Discount
- Venue-spend entitlement
- Payment fee
- Total paid
- Payment status
- Booking status
- Cancellation terms
- Check-in info
- Issue date

Generated from authoritative server data.

---

## SECTION 33: IMAGES

Must work consistently everywhere: listing cards, detail pages, host dashboard, admin review, booking details, notifications, moderation screens.

**Handle properly:** loading, missing, failed, thumbnails, ordering, primary, deletion, replacement, permissions.

---

## SECTION 34: COMPLETE PROFILE — GUEST

**Collect:** phone, location, gender (where needed), referral source (optional)

**Must agree to:** Terms and Conditions, privacy policies

**Do NOT ask for:** business name, business type, operating hours, provider documents

---

## SECTION 35: COMPLETE PROFILE — VENUE HOST

**Provider role:** Venue Host (NOT "Business Type: Venue Owner / Event Planner")

**Profile collects:** full name, phone, email, profile photo, location, preferred contact, verification info, agreement to guidelines/terms

Physical venue details belong to the listing, not generic profile.

---

## SECTION 36: VENUE LISTING INFORMATION

**Structured collection:**
- Basic: name, type, subtype, description
- Location: address, area, city, state, landmark, coordinates
- Contact: venue contact info (per privacy rules)
- Capacity: maximum guest capacity
- Booking modes: capacity, exclusive
- Availability: recurring schedule, special dates, blocked periods
- Amenities: structured selectable options
- Offerings: food, drinks, entertainment, games, music, etc.
- Rules: restrictions, requirements
- Photos: primary, gallery order, captions

---

## SECTION 37: OUTDOOR SPACE LISTING INFORMATION

**Own structured form:** name, description, location, space size, intended uses, amenities, facilities, accessibility, parking, power, restroom, security, permitted activities, restrictions, photos, availability, exclusive booking periods, pricing.

**Do NOT force through Venue capacity-booking form.**

---

## SECTION 38: SHORTLET APARTMENT HOST

**Provider role:** Shortlet Apartment Host

**Business types:**
- Housing Agent
- Property Owner

**Do NOT create:** Property Manager as business type

**Onboarding:**
```
What do you host? → Shortlet Apartment Host
What is your role? → Housing Agent | Property Owner
```

---

## SECTION 39: HOUSING AGENT VS PROPERTY OWNER

**Housing Agent:** May manage multiple properties. Collect agency/provider info and verification.

**Property Owner:** May manage multiple properties. Collect ownership/property evidence.

Do NOT force every owner to provide professional-agent credentials.

---

## SECTION 40: HOUSING LISTINGS

**Structured info:** title, type, address, area, city, state, location, description, rooms, bedrooms, bathrooms, furnished/unfurnished, amenities, facilities, photos, availability, monthly price, lease duration options, deposit, other charges, house rules, contact process, viewing info, provider info, verification status.

---

## SECTION 41: HOUSING PRICE/DURATION

**Base:** Monthly price

**Lease options:** 6 months, 12 months with optional host-configured discounts.

Formula: `monthly base price + lease duration + applicable discount = booking/contract amount`

---

## SECTION 42: HOUSING VIEWING

**Separate process from housing payment:**

Find property → Review → Request viewing → Pay viewing fee → Receive contact info → View → Decide → Pay if proceeding

Viewing must NOT accidentally become housing booking.

---

## SECTION 43: VIEWING FEE

**Host sets transport/viewing charge.** ClockHost adds its component. Guest sees complete amount before payment.

After viewing payment: agreed contact info released per platform rules.

Guests may skip viewing where rules allow.

---

## SECTION 44: HOUSING PAYMENT EVIDENCE

Stronger documentation than venue bookings.

**Preserve:** payment reference, payer, recipient, property, amount, date/time, status, agreement snapshot, uploaded evidence, receipt, confirmation.

Screenshots = evidence, NOT authoritative payment confirmation.

---

## SECTION 45: AGENT UNDERTAKING / DOCUMENTS

Model explicitly: document/version, provider, date, acceptance, declarations, status.

**Distinguish:**
- ClockHost platform agreement
- Property ownership document
- Professional credential
- Payment evidence

Do NOT create fake legal documents presented as government-issued.

---

## SECTION 46: ADMIN

Not just another dashboard. Must have controlled authorization.

**Capabilities:** review providers, listings, approve/reject, suspend, review bookings/disputes/payments/refunds/evidence/reports, inspect audit history.

All admin actions recorded.

---

## SECTION 47: LISTING APPROVAL

**Lifecycle states:**
```
draft → submitted → under_review → approved → rejected
                                              → suspended
                                              → archived
```

Unapproved listing must NOT become publicly bookable.

Admin sees: listing info, photos, provider info, verification, pricing, availability, documents, review history.

---

## SECTION 48: PROVIDER VERIFICATION

**Separate from listing approval:**
```
Provider verification: pending / verified / rejected / suspended
Listing approval:      draft / submitted / approved / rejected / suspended
```

Do NOT combine into one vague status.

---

## SECTION 49: AUTOMATIC SUSPENSION

**Model:** Automatic temporary suspension based on thresholds + manual final decision.

Do NOT permanently ban automatically from one event.

**Record:** trigger, threshold, timestamp, affected account/listing, temporary period, admin review, final decision, reason.

---

## SECTION 50: AUDIT LOG

**Immutable/auditable records for:**
- Provider verification
- Listing approval/rejection/suspension
- Price changes
- Availability changes
- Booking creation/cancellation
- Payment confirmation
- Refunds
- Check-in
- Admin actions
- Document upload/approval

**Contains:** actor, action, resource, timestamp, before/after, reason.

Ordinary users cannot modify audit records.

---

## SECTION 51: AUTHENTICATION AND AUTHORIZATION

**Separate concepts.**

Authorization at multiple layers:
```
UI → server route/action → business rule → database/RLS
```

Never rely only on frontend visibility.

---

## SECTION 52: DATABASE SECURITY

**Use Row Level Security (RLS).**

Test all of:
- Guest accesses own records ✓
- Guest cannot access another's private records ✓
- Provider accesses own listings ✓
- Provider cannot edit another's listing ✓
- Admin accesses authorized data ✓
- Public users access only intentionally public info ✓

---

## SECTION 53: SERVER AUTHORITY

**Server is source of truth for:**
- Price
- Booking availability
- Capacity
- Payment amount
- Booking ownership
- Permissions
- Verification
- Approval
- Cancellation eligibility
- Refund amount

Browser is NEVER the source.

---

## SECTION 54: DATABASE CONSTRAINTS

Business invariants enforced at DB level where possible:
- One Venue Host → max one listing (enforced)
- Booking reference → unique
- Payment reference → unique

Do not depend only on application code for critical uniqueness.

---

## SECTION 55: MEDIA ARCHITECTURE

**Proper media model:**
- id
- owner/resource
- url/path
- type
- position
- is_primary
- created_at

Private evidence docs must NOT be publicly accessible via URL.

---

## SECTION 56: PRODUCT UX PRINCIPLE

**Hosts see:** What do I manage? What's available? What's booked? What do I earn? What needs attention?

**Guests see:** What is this? When can I use it? How much? What am I getting? Rules? What happens after payment?

Do not expose unnecessary technical concepts.

---

## SECTION 57: DASHBOARD — VENUE HOST

**Navigation:**
- My Listing
- Calendar
- Reservations
- Reviews
- Earnings
- Analytics
- Messages
- Notifications
- Settings

**Do NOT show:** Add another venue, My properties, Add apartment, Property management

Dashboard adapts to listing type (Venue vs Outdoor Space).

---

## SECTION 58: DASHBOARD — SHORTLET APARTMENT HOST

**Navigation:**
- My Properties
- Add Property
- Calendar
- Reservations / Requests
- Reviews
- Earnings
- Analytics
- Messages
- Notifications
- Settings

---

## SECTION 59: LISTING-SPECIFIC DASHBOARDS

**Capabilities derived from listing type:**

Venue → capacity settings, exclusive booking settings, guest capacity, hourly pricing, venue availability

Outdoor Space → exclusive availability, time periods, exclusive pricing

Housing → property availability, viewing, monthly pricing, lease duration, property documents

---

## SECTION 60: COMPLETE PROFILE ROUTING

```
Sign up
  → Authentication verification
  → Determine onboarding state
  → Complete Profile
  → Provider role selection (where applicable)
  → Role-specific profile
  → Listing creation (where applicable)
  → Submission/review
  → Dashboard
```

**RULE:** Incomplete onboarding = cannot bypass via direct navigation. Protected routes enforce onboarding state server-side.

---

## SECTION 61: FIX THE CURRENT BOOKING BYPASS

**Known issue:** Users can sometimes initiate booking directly from homepage without completing authentication/onboarding.

**Correct this.**

**Public users may:** browse, search, view public listings.

**Protected actions (must enforce auth + account state):**
- Book
- Pay
- Create group booking
- Request housing process
- Manage reservations

**Do NOT simply hide the button.** Server must reject unauthorized requests.

---

## SECTION 62: ROUTE PROTECTION

Protected routes must be protected on the SERVER.

**Protected paths:**
- `/dashboard/*`
- `/bookings/*`
- `/payments/*`
- `/host/*`
- `/admin/*`

Do NOT rely only on client-side redirects. Manually entered protected URLs must receive appropriate auth/authz response.

---

## SECTION 63: FORM VALIDATION

Use schema validation consistently. Do NOT trust HTML validation alone.

**Validate:** types, required fields, ranges, enums, dates, times, relationships, ownership, business rules.

**Validate on both:** client + server. Server validation is authoritative.

---

## SECTION 64: DOMAIN ENUMS

Do NOT use free-form strings where controlled domain value is required.

**Enums needed:**
- `provider_role`
- `listing_type`
- `booking_type`
- `booking_status`
- `payment_status`
- `verification_status`
- `listing_status`

**RULE:** `venue`, `Venue`, `VENUE`, `venue_host`, `VenueHost` must NOT become different meanings.

---

## SECTION 65: AVOID PATTERN-MATCHING ENGINEERING

Do NOT blindly copy one workflow and rename fields.

**Do NOT create:**
- `VenueBookingForm`
- `HousingBookingForm`
- `OutdoorBookingForm`

by copying one generic form and changing labels.

**First:** identify domain rules. **Then:** share only genuinely reusable components.

Shared infrastructure ✓ | Forced business-model reuse ✗

---

## SECTION 66: SHARED VS SPECIALIZED ARCHITECTURE

**SHARE:**
- Authentication
- Authorization
- Validation infrastructure
- Media handling
- Notifications
- Audit logging
- Payment infrastructure
- Common UI primitives
- Date/time utilities
- Error handling

**SPECIALIZE:**
- Venue listing rules
- Outdoor-space listing rules
- Housing listing rules
- Capacity availability
- Exclusive availability
- Housing viewing
- Lease pricing
- Housing evidence
- Venue spend entitlement

This is the correct balance.

---

## SECTION 67: TIME ENGINE MODULE

Create a clear time/availability domain module.

**Responsible for:**
- Availability rules
- Schedule expansion
- Special dates
- Blocked dates
- Time ranges
- Overlap detection
- Booking windows
- Duration validation
- Timezone conversion
- Capacity availability
- Exclusive conflicts

**Do NOT:** scatter date calculations through React components. Do NOT calculate booking availability in five different files.

**ONE authoritative domain implementation.**

---

## SECTION 68: MONEY ENGINE MODULE

Create a central money/pricing module.

**RULE:** Never use floating-point arithmetic for financial calculations.

Use integer minor units. For Nigerian Naira:
```
₦2,000 → 200000 kobo
```

Every calculation must be deterministic.

---

## SECTION 69: PRICING SNAPSHOT

At checkout, save the exact calculated values:

```
base_amount
guest_count
duration
discount_amount
venue_spend_entitlement
venue_component
clockhost_component
payment_fee
total_amount
currency
pricing_rule_version
```

Historical transactions must be auditable.

---

## SECTION 70: ERROR HANDLING

Errors should be useful.

**Do NOT expose:** Postgres errors, stack traces, `undefined`, internal server error.

**Do provide:**
```
Booking unavailable
This time has just been booked by another guest.
Please select another time.
```

Log technical details internally.

---

## SECTION 71: CONCURRENCY

Assume multiple users act simultaneously.

**Example:** Two users try to book final 2 seats → one successful, one rejected. NOT two successful.

**Example:** Two users cannot reserve same exclusive period simultaneously.

**Enforced at:** backend/database level.

---

## SECTION 72: CANCELLATION

Cancellation rules must be explicit. Do NOT simply delete a booking.

**State transition:**
```
confirmed → cancellation_requested → cancelled → refund_processing → refunded
```

Only implement states the actual workflow needs. Preserve original transaction.

---

## SECTION 73: REFUNDS

Refunds must be server-controlled. Never let browser choose refund amount.

**Partial refund:**
```
original amount - refund amount = remaining settled amount
```

**Record:** refund reference, amount, reason, actor, timestamp, provider status, booking status.

---

## SECTION 74: DISPUTES

A dispute must NOT automatically alter financial records.

**Dispute record contains:**
- Booking
- Guest
- Provider
- Reason
- Evidence
- Status
- Admin decision
- Timestamps

Financial changes happen only after authorized decision/process.

---

## SECTION 75: COMMUNICATION

Guests and hosts may need to: call, email, discuss booking details, arrange meetings.

**Private contact details exposed ONLY according to relevant workflow.**

Do NOT expose phone numbers simply because they exist in the database.

---

## SECTION 76: NOTIFICATIONS

Notifications should be event-driven.

**Events:**
- Listing submitted/approved/rejected
- Booking created
- Payment successful
- Booking confirmed/cancelled
- Refund issued
- Viewing request/confirmed
- Admin action

**Do NOT** duplicate notification logic in every component. Use central notification service.

---

## SECTION 77: OBSERVABILITY

Implement useful application logging even without paid infrastructure.

**Log:** payment initiation, payment verification, booking creation, booking conflict, webhook processing, refund, admin action, authorization failure.

**NEVER log:** passwords, payment secrets, private tokens, sensitive credentials.

---

## PENDING SECTIONS (78-80)

**Status:** Awaiting more input from user.

---

# GAP ANALYSIS

> Full codebase inspection completed. Every database table, migration, auth flow, booking system, payment flow, listing system, admin flow, and test file analyzed against the specification.

## ALREADY CORRECT

| Item | Spec Section | Notes |
|------|-------------|-------|
| Provider roles: `venue_host`, `housing_agent`, `admin`, `guest` | §2 | Role values are correct and consistent |
| `requireHost()` and `requireAdmin()` helpers | §51 | Clean separation of auth from authz |
| `provider_profiles` table with `provider_type` | §35 | One profile per user (UNIQUE constraint) |
| `provider_verifications` table | §48 | Separate from listing approval |
| `booking_transitions` table for audit trail | §50 | Immutable transition log |
| `listing_media` table with `is_primary`, `sort_order` | §55, §33 | Proper media model |
| `blocked_dates` table with CHECK constraints | §11, §26 | Correctly constrained |
| Exclusion constraint on exclusive bookings | §26 | Prevents overlapping exclusive bookings at DB level |
| Exclusion constraint on slots | §9 | Prevents overlapping slots at DB level |
| `payment_records` table with status CHECK | §18 | Correct states defined |
| `processed_webhooks` table for idempotency | §30 | Webhook deduplication works |
| RLS enabled on all major tables | §52 | 17 of 18 tables have RLS |
| Audit log table with actor/action/resource | §50 | Clean audit trail |
| Paystack integration with HMAC verification | §17 | Signature verification present |
| `computeCapacityPriceKobo` function | §15 | Server-side pricing calculation |
| State machine for booking transitions | §28 | Defined transitions, though missing some states |
| Listing status lifecycle: draft → pending_review → active | §47 | Correct states defined |
| Group booking with single payer | §22 | Correct model |
| `group_plans` + `plan_members` tables | §22 | Proper structure for group bookings |
| CSRF validation on most mutation routes | §62 | Present on most POST routes |
| Rate limiting on critical routes | §71 | Booking, reserve, payment initiation |
| Schema validation via Zod in `validation.js` | §63 | Listing create/update validated |
| Search with PostGIS proximity | §10 | Geo search functional |
| African/Lagos timezone default on users table | §10 | Default set |

## NEEDS MODIFICATION

| Item | Spec Section | Issue | Fix Required |
|------|-------------|-------|-------------|
| Booking status enum missing `no_show` and `expired` | §28 | Status list: `pending, awaiting_payment, confirmed, completed, cancelled, rejected, lost_race` — missing `no_show`, `expired` | Add `no_show` and `expired` to CHECK constraint |
| Missing `host_id` on bookings table | §22, §24 | Bookings query `guest_id` and `listing_id` but no direct `host_id`. Cancel route references `booking.host_id` which doesn't exist | Add `host_id` column or properly join through listing → provider_profile |
| Commission hardcoded at 5% in multiple places | §15, §17 | Reserve route: 5%, booking route: 5%, pricing.js: none. Scattered | Create central commission config |
| No venue-spend entitlement in pricing | §16 | Current pricing is flat rate × headcount × hours. No venue-spend breakdown | Add venue_spend_entitlement to pricing snapshot |
| `operator_hours` collected in complete-profile but never saved | §35 | Form sends it, API ignores it | Either save or remove from form |
| `fullName` not collected during onboarding | §35 | API expects it, form doesn't send it | Add fullName field to complete-profile form |
| Complete-profile redirect doesn't use `getRedirectPath` | §60 | Hardcoded `isProvider ? "/host/dashboard" : "/dashboard"` | Use centralized redirect function |
| Dashboard page has no role gate | §57 | `/dashboard` accessible to any authenticated user | Add `RoleGate` or server-side check |
| Approve/reject/complete booking routes missing CSRF | §62 | `POST /bookings/[id]/approve`, `complete`, `reject` have no CSRF | Add CSRF validation |
| Payments initiation route missing CSRF | §62 | `POST /payments/initiate` has no CSRF | Add CSRF validation |
| Admin listing reject uses `ok()` for 400 error | §70 | Semantic error in response helper | Use `fail()` instead |
| Admin suspend route has no reason field | §46, §49 | Suspension without explanation | Add required `reason` parameter |
| Listing `status` CHECK missing `under_review` state | §47 | Spec says `under_review` but DB has `pending_review` | Rename or add `under_review` |
| Booking cancel notification missing host_id | §76 | `booking.host_id` referenced but column doesn't exist | Fix join to get host user ID |
| Geo search params parsed but not forwarded | §10 | `lat`, `lng`, `radiusKm` validated but never passed to query | Forward params to `listListings()` |
| Exclusive lock has no `expires_at` | §26 | Stale locks never cleaned up | Add expiry field and cleanup |
| `lost_race` status not in booking status CHECK | §28 | Used in code but not in DB constraint | Add to CHECK constraint |
| `payment_records.status` missing `processing` state | §29 | Spec needs processing state for in-flight payments | Add to CHECK constraint |
| Provider verification routes use `NextResponse.json` directly | §63 | Inconsistent with `ok()`/`fail()` pattern | Standardize response helpers |
| Mixed database access patterns (pg pool + Supabase client) | §82 | `booking.js` and `exclusive.js` use raw pg pool | Consolidate to single access pattern |
| No ` Property Owner` business type | §38, §39 | Only `housing_agent` exists, no `property_owner` | Add `property_owner` as business type under `housing_agent` role |
| WhatsApp sessions table has no RLS | §52 | Only table without RLS | Enable RLS |

## NEEDS MIGRATION

| Item | Spec Section | Migration Needed |
|------|-------------|-----------------|
| Add `host_id` column to bookings | §22, §24 | New column with FK → users(id), backfill from listing join |
| Add `no_show` and `expired` to bookings status CHECK | §28 | ALTER TABLE to update CHECK constraint |
| Add `lost_race` to bookings status CHECK | §28 | ALTER TABLE to update CHECK constraint |
| Add `processing` to payment_records status CHECK | §29 | ALTER TABLE to update CHECK constraint |
| Add `expires_at` to exclusive_locks | §26 | New column with default |
| Add `under_review` or rename `pending_review` in listings | §47 | UPDATE existing data, ALTER CHECK |
| Add venue-spend entitlement fields to pricing_snapshot | §16 | Alter JSONB structure |
| Add `property_owner` business type option | §38 | No schema change needed, just UI |
| Add `reason` to admin suspension path | §46 | Add column or use metadata JSONB |
| Add listing listing_limit enforcement at DB level | §4 | CHECK or trigger: one listing per provider_profile_id |
| Enable RLS on whatsapp_sessions | §52 | ALTER TABLE ENABLE ROW LEVEL SECURITY |

## MISSING

| Item | Spec Section | What's Missing |
|------|-------------|----------------|
| One-listing-per-venue-host enforcement | §4 | No DB constraint or trigger. API checks but DB doesn't enforce |
| Venue-spend entitlement display | §16 | Not in pricing model or UI |
| Configurable pricing engine | §15 | All prices hardcoded, no host-configurable pricing |
| Multi-hour discount logic | §21 | Not implemented |
| Multi-guest discount logic (starting at 2 guests) | §20 | Not implemented |
| Payment fee calculation (1.5% + ₦100) | §17 | Not implemented, only 5% commission exists |
| Pricing snapshot at checkout showing: base, discount, venue-spend, fee, total | §21, §69 | Partial — missing discount, venue-spend, fee breakdown |
| Outdoor Space listing type (exclusive only) | §7, §27 | `booking_type` CHECK has `exclusive` but no Outdoor Space specific flow |
| Outdoor Space time periods (Morning, Evening, etc.) | §12 | No UI or data model for period-based pricing |
| Structured venue description sections | §13 | Only free-text description field exists |
| Housing listing flow | §40, §41 | Housing bookings exist but monthly pricing and lease duration not implemented |
| Housing viewing workflow | §42, §43 | Viewing table exists but workflow incomplete |
| Complete profile routing enforcement | §60 | No middleware enforcement of onboarding state |
| Booking bypass protection | §61 | Homepage can initiate booking without auth |
| Group booking check-in with rotating tokens | §24 | No check-in token system |
| Shared booking view (read-only for attendees) | §23 | No shared booking endpoint |
| Provider notification on listing approval/rejection | §76 | No notification sent |
| Guest notification on booking cancellation by host | §76 | Notification attempted but broken (missing host_id) |
| Notification preferences | §76 | `notification_preferences` table exists but not wired up |
| Automatic suspension based on thresholds | §49 | Not implemented |
| Admin audit trail view | §50 | Audit table exists but no admin UI to view it |
| Pricing snapshot version tracking | §69 | `pricing_rule_version` not in snapshot |
| Idempotency keys on booking creation | §30 | No idempotency protection |
| Atomic booking creation (no race condition) | §28, §71 | Soft hold → booking conversion is not atomic |
| Central notification service | §76 | Notifications scattered across route handlers |
| Central payment calculation layer | §17 | Payment logic scattered across routes |
| Proper receipt/booking evidence generation | §32 | No receipt generation system |
| Media access permissions for private docs | §55 | All listing_media publicly accessible |
| Debug route at /api/debug/db should be removed or protected | — | Exposes DB connection info |

## CONFLICTING

| Item | Spec Section | Conflict |
|------|-------------|---------|
| Pricing at reserve vs booking creation | §15, §21 | Reserve adds 5% service fee on total. Booking creation recomputes with different formula. Prices may differ. |
| `blocked_dates` uses `blocked_date` (DATE) | §10, §11 | Spec requires start_time + end_time granularity. Current model only supports full-day blocks. |
| Booking `headcount` vs spec's "Maximum guest capacity" | §9 | Field name is `headcount` but spec says use "Maximum guest capacity" in UI. DB column name is fine but UI text must change. |
| `vertical` field on listings | §6, §7 | Used to distinguish Venue vs Outdoor Space. But spec says listing_type, not vertical. The `booking_type` field (`exclusive`/`capacity`/`housing`) partially covers this but the mapping is unclear. |
| Two audit systems: `src/lib/audit.js` and `src/lib/db/audit.js` | §50 | Different implementations for same concept. Only `db/audit.js` is widely used. |

## UNSAFE

| Item | Spec Section | Risk |
|------|-------------|------|
| Booking creation from soft hold is not atomic | §28, §71 | Two concurrent requests can both convert the same hold → double booking |
| Exclusive lock creation is not atomic | §26, §71 | Two concurrent exclusive requests can both succeed |
| State machine has no concurrency protection | §28, §71 | Read-then-update pattern allows two transitions to both succeed |
| Webhook processing not transactional with booking update | §30 | Crash between processed_webhook insert and booking confirm = lost confirmation |
| `resolveExclusiveLock` marks `lost_race` on ANY error | §71 | Transient DB errors permanently mark booking as lost |
| `verifyTransaction` exists but is never called | §17, §29 | Webhook trusts payload alone, no server-side verification |
| Payment initiation has no idempotency | §30 | Double-click creates two Paystack transactions |
| Session JWT not verified (signature check skipped) | §51 | Forged JWT cookie accepted at local-decode level |
| Logout doesn't revoke Clerk session | §51 | JWT remains valid until expiry after logout |
| `dashboard/page.js` has no auth redirect for unauthenticated users | §61 | Shows loading skeleton indefinitely |
| POST /bookings doesn't check booking expiry | §29 | Payment can be initiated for expired bookings |

## DUPLICATED

| Item | Where | Issue |
|------|-------|-------|
| Commission calculation (5%) | `reserve/route.js`, `bookings/route.js`, `exclusive/request/route.js` | Hardcoded in 3 places |
| Pricing calculation | `reserve/route.js`, `bookings/route.js`, `pricing.js`, `exclusive/request/route.js` | 4 different implementations |
| Auth check pattern | Multiple routes | Some use `requireAuthenticatedUser`, some manually parse cookies |
| Response helpers | `ok()`/`fail()` vs `NextResponse.json()` | Two patterns across routes |
| Provider role check | `listings/route.js`, `provider/verifications/route.js` | Manual string comparison instead of `requireHost()` |
| Dynamic imports | `admin/verifications/route.js`, `provider/verifications/route.js` | `await import()` inside function body instead of top-level |

---

# IMPLEMENTATION PRIORITY

Based on the gap analysis, here is the recommended order of implementation:

## Phase 1: Critical Safety (Must fix before anything else)
1. Make booking creation atomic (fix race condition)
2. Make exclusive lock creation atomic
3. Add idempotency keys to booking creation
4. Make webhook processing transactional
5. Add missing statuses to DB CHECK constraints (`no_show`, `expired`, `lost_race`, `processing`)
6. Add `host_id` to bookings table
7. Fix cancel notification (missing host_id)
8. Add CSRF to all mutation routes
9. Fix `resolveExclusiveLock` error handling
10. Call `verifyTransaction` in webhook handler

## Phase 2: Core Product Gaps
11. Add one-listing-per-venue-host enforcement at DB level
12. Add venue-spend entitlement to pricing model
13. Add configurable commission/pricing (not hardcoded 5%)
14. Add multi-guest discount (starting at 2 guests)
15. Add multi-hour discount
16. Add Paystack fee calculation (1.5% + ₦100, configurable)
17. Build pricing snapshot with full breakdown
18. Build receipt/booking evidence generation
19. Add Outdoor Space exclusive-only listing flow
20. Add structured venue description sections

## Phase 3: Auth & Route Protection
21. Enforce onboarding state in middleware
22. Fix booking bypass on homepage
23. Add role gate to dashboard page
24. Add role gate to all protected routes
25. Fix complete-profile redirect to use `getRedirectPath`

## Phase 4: Housing & Viewing
26. Complete housing listing flow with monthly pricing
27. Add lease duration options
28. Complete viewing workflow
29. Add viewing fee handling

## Phase 5: Admin & Notifications
30. Add notification to provider on listing approval/rejection
31. Add notification on booking cancellation (fix broken one)
32. Wire up notification preferences
33. Add admin audit trail view
34. Add automatic suspension based on thresholds
35. Add reason to admin suspension

## Phase 6: Testing & Cleanup
36. Write tests for all API routes
37. Write tests for booking state machine
38. Write tests for pricing calculations
39. Write tests for authorization
40. Write tests for concurrency scenarios
41. Remove dead code (booking.js, exclusive.js markWebhookProcessing)
42. Consolidate database access patterns
43. Standardize response helpers
44. Remove debug route
45. Enable RLS on whatsapp_sessions

## Phase 7: UI & UX
46. Structured venue description UI
47. Pricing breakdown display at checkout
48. Venue-spend entitlement display
49. Admin review UI with photos
50. Group booking share view
51. Check-in token system
52. Dashboard adaptation per listing type

---

## MIGRATION PLAN CHECKLIST

> Track which migrations need updating based on spec changes

| Migration | Status | Notes |
|-----------|--------|-------|
| migration.sql | PENDING REVIEW | Check against spec |
| migration-batch2.sql | PENDING REVIEW | Check against spec |
| migration-batch3.sql | PENDING REVIEW | Check against spec |
| ... | ... | ... |

---

## API ROUTE CHECKLIST

> Track which API routes need updating based on spec changes

| Route | Status | Notes |
|-------|--------|-------|
| /api/auth/* | PENDING REVIEW | |
| /api/listings/* | PENDING REVIEW | |
| /api/bookings/* | PENDING REVIEW | |
| ... | ... | ... |

---

## COMPONENT CHECKLIST

> Track which UI components need updating

| Component | Status | Notes |
|-----------|--------|-------|
| Homepage | PENDING REVIEW | |
| Auth pages | PENDING REVIEW | |
| Host dashboard | PENDING REVIEW | |
| ... | ... | ... |

---

## KEY CONSTRAINTS SUMMARY (FOR QUICK REFERENCE)

1. **ClockHost** — never HostMe/hostme
2. **One listing per Venue Host** — enforced at DB level
3. **Venue OR Outdoor Space** — not both
4. **Outdoor Space = exclusive booking only** — no capacity
5. **Time is first-class** — not just calendar
6. **Africa/Lagos timezone** — not browser time
7. **Server is authority** — never trust browser
8. **Atomic bookings** — no race conditions
9. **Idempotent payments** — no double-credit
10. **Snapshot preserved** — confirmed bookings don't change
11. **Configurable pricing** — no hard-coded fees
12. **Separate verification from approval** — not one status
13. **Discount starts at 2 guests** — not 3
14. **Structured venue description** — not free-text blob
15. **Food/drink display only** — ClockHost ≠ food order
16. **Viewing separate from payment** — don't accidentally combine
17. **RLS on every table** — test all access patterns
18. **Audit all important actions** — immutable records
19. **Media model** — not random URLs in unrelated tables
20. **Onboarding enforced server-side** — no bypass via navigation
21. **Server rejects unauthorized booking** — don't just hide buttons
22. **Protected routes on server** — client-side redirect not enough
23. **Schema validation on server** — HTML validation not enough
24. **Domain enums** — no free-form status strings
25. **Share infra, specialize rules** — don't copy-and-rename forms
26. **One time engine module** — not scattered across components
27. **Integer money (kobo)** — no floating-point for financials
28. **Pricing snapshot at checkout** — auditable history
29. **Useful errors to user** — never expose internals
30. **Concurrency enforced at DB** — no double-booking
31. **Cancellation = state transition** — never delete bookings
32. **Refunds server-controlled** — browser never chooses amount
33. **Disputes don't auto-alter finances** — need authorized decision
34. **Private contact per workflow** — not auto-exposed
35. **Central notification service** — not duplicated everywhere
36. **Never log secrets** — passwords, tokens, credentials
