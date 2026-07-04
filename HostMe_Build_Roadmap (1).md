# HostMe - Build Roadmap & AI Coding Tool Instructions

This is the file to paste first into the AI coding tool session — it tells it how to consume the other six documents and in what order to build.

## 1. Document Set (feed in this order)
1. `HostMe_Master_Blueprint_v2.md` — philosophy and business logic, read-only context
2. `HostMe_PRD_v3.md` — functional spec, the source of truth for behavior
3. `HostMe_Design_System.md` — visual tokens, apply to every UI component
4. `HostMe_Database_Schemas_v2.md` — Listing, Slot, SoftHold, Booking, ExclusiveLock
5. `HostMe_Remaining_Data_Models.md` — User, Transaction, Message, Review, Dispute, Notification
6. `HostMe_Cancellation_Refund_Policy.md` — tiered refund logic + split-refund mechanics
7. `HostMe_Auth_Identity_v2.md` — auth flows, lite identity, RBAC, multi-role accounts
8. `HostMe_API_Route_Contract.md` — exact routes to implement

## 2. Repo Structure

```
/src
  /app
    /(public)
      /listings/[id]/page.jsx        -- Screen 2
      /search/page.jsx                -- Screen 1
    /(guest)
      /bookings/page.jsx              -- guest inbox
      /bookings/[id]/pass/page.jsx    -- Screen 5
    /(host)
      /host/listings/new/page.jsx
      /host/bookings/page.jsx         -- Screen 6
      /host/scanner/page.jsx          -- Screen 7
    /(admin)
      /system-perimeter/page.jsx      -- isolated login
      /admin/dashboard/page.jsx       -- Screen 8
    /api/...                          -- per API Route Contract
  /models                             -- Mongoose schemas, one file per model
  /lib
    /gateway/                         -- Paystack/Monnify SDK wrappers
    /scrub/                           -- chat regex scrubber
    /jwt/                             -- digital pass encode/decode
    /rate-limit/                      -- Upstash wrapper
  /components
    /ui/                              -- shadcn primitives, themed
    /booking/                         -- shared booking UI (capacity + exclusive variants)
```

**Convention (per OneEvent precedent, applied here too):** new features add new files rather than editing existing ones. Main/dev/feature branch structure.

## 3. Build Stages

**Stage 0 — Foundation**
- Next.js 15 App Router scaffold, Tailwind + shadcn themed with Design System tokens
- Mongoose connection, all models from schema docs wired up with indexes
- NextAuth v5 config: OTP provider (guest/host), separate TOTP flow (admin)

**Stage 1 — Listings & Discovery**
- Screen 1 (Discovery Hub) + Screen 2 (Space Details) — read paths only, no payment yet
- Host listing creation flow, admin approve/reject queue
- Geospatial + compound index search working end to end

**Stage 2 — Capacity-Based Booking Engine**
- `Slot` model, atomic reservation endpoint, `SoftHold` + TTL expiry sweep
- Screen 3 (Intake Form) for capacity listings
- Live capacity counter on Screen 2 (Pusher/Socket.io)

**Stage 3 — Exclusive-Space Booking Engine**
- `ExclusiveLock` model, approve/reject flow, atomic race-resolution in webhook handler
- Auto-refund path for `lost_race` bookings — build and test this before anything else in Stage 3 ships, since it's the failure mode that damages trust fastest if broken

**Stage 4 — Payments**
- Paystack/Monnify split integration, webhook idempotency guard (unique index pattern)
- `Transaction` ledger writes for charge/refund/commission/payout
- New-host payout delay + velocity cap enforcement
- Tiered cancellation + gateway split-refund flow (`HostMe_Cancellation_Refund_Policy.md`) — build and test the failed-reversal → `disputed` fallback path here, not deferred to Stage 7

**Stage 5 — Identity & Trust**
- Bank account-name-resolution flow, fuzzy match, admin review queue for mismatches
- Step-up OTP on payout account changes
- Optional Verified Host badge upload + admin approval

**Stage 6 — Chat & Digital Pass**
- Paid routing-fee unlock, real-time chat with server-side scrubbing (raw vs display content)
- JWT digital pass generation, Screen 5 (Ticket Room), Screen 7 (Door Scanner) with atomic claim

**Stage 7 — Reviews, Disputes, Notifications**
- Review model post-completion
- Dispute open/resolve flow (admin)
- Notification trigger matrix wired to all events listed in the Remaining Data Models doc

**Stage 8 — Admin CMS & Polish**
- Screen 8 full build: host trust table, Fraud Monitor, God-Mode controls
- Empty/loading/error states audit across every screen (Design System §7)
- Rate limiting applied across all mutating routes

## 4. Environment Variables (baseline)

```
MONGODB_URI=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=
MONNIFY_API_KEY=
MONNIFY_SECRET_KEY=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
PUSHER_APP_ID=
PUSHER_KEY=
PUSHER_SECRET=
TERMII_API_KEY=          # if reusing OneEvent's OTP provider
JWT_PASS_SECRET=         # separate from NEXTAUTH_SECRET — used only for digital pass tokens
ADMIN_TOTP_ISSUER=
```

## 5. Gap Status (all three previously flagged items are now resolved)

- ✅ **Cancellation policy** — resolved via `HostMe_Cancellation_Refund_Policy.md`: three-tier model (flexible/moderate/strict), gateway split-refund mechanics, state machine addition, new API routes.
- ✅ **Dual-role accounts** — resolved: `User.roles` array + `activeRole` session context, RBAC enforced server-side regardless of active role. See Auth spec §5.
- ✅ **Same physical space, two booking types** — resolved: `Listing.physicalSpaceId` groups sibling listings for host-dashboard display without merging their independent booking engines.

## 6. Remaining Items Found in Full Audit (new — not previously flagged)

- **Refund reversal failure risk is inherent to the no-escrow model**, not fully solvable by policy — see Cancellation doc §2. The new-host payout delay is the main mitigant; established hosts carry residual risk by design. Worth a business-level sign-off that this trade-off is acceptable, since no engineering pattern eliminates it entirely without reopening the escrow decision.
- **Exclusive-Space auto-renotification is out of Phase 1 scope** (Cancellation doc §4) — when a slot re-opens after cancellation, previously-rejected guests are not automatically re-alerted. Confirm this is acceptable for launch; it's a reasonable Phase 2 add if not.
- **Role-switcher UI has no explicit screen in the original 8-screen matrix** — it lives in Screen 1's nav per the Auth spec, but the PRD's Screen 1 description should be read alongside Auth spec §5 rather than treated as a separate screen; no new screen number is needed, just don't let the coding tool skip building the switcher because it isn't itemized as its own screen.

## 6. Definition of Done (per stage)
A stage isn't complete until: the atomic concurrency patterns are actually tested under simulated concurrent requests (not just single-request happy path), every screen has its four required UI states, and webhook handlers have been verified idempotent by firing the same payload twice manually.
