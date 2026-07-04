# AGENTS.md — HostMe

This file is read automatically by most AI coding tools (Copilot, Claude Code, Cursor, Gemini CLI, and others that support the AGENTS.md standard). If you switch tools later, this file travels with the repo — keep it as the source of truth and update `.github/copilot-instructions.md` to match if Copilot-specific syntax needs it.

## Project summary
HostMe is a multi-vertical transactional marketplace for the Nigerian commercial hospitality and mid-tier real estate market: venue bookings (capacity-based and exclusive-space), regulated real estate viewings, and on-site pre-ordering. Instant split-payment settlement (95% host / 5% platform) via Paystack/Monnify — no escrow holding.

Full specification set lives in `/docs`, read in this order for a first-time onboarding:
1. `HostMe_Master_Blueprint_v2.md` — philosophy, why the product works the way it does
2. `HostMe_PRD_v3.md` — functional spec and screen matrix
3. `HostMe_Design_System.md` — colors, type, spacing, component tokens
4. `HostMe_Database_Schemas_v2.md` — Listing, Slot, SoftHold, Booking, ExclusiveLock + atomic concurrency patterns
5. `HostMe_Remaining_Data_Models.md` — User, Transaction, Message, Review, Dispute, Notification
6. `HostMe_Cancellation_Refund_Policy.md` — tiered refunds, split-refund mechanics
7. `HostMe_Auth_Identity_v2.md` — auth, lite identity, RBAC, multi-role accounts
8. `HostMe_API_Route_Contract.md` — every route to implement
9. `HostMe_Build_Roadmap.md` — stage-by-stage build order, repo structure, env vars

## Tech stack (locked)
Next.js 15 App Router · JavaScript, not TypeScript · MongoDB Atlas + Mongoose · NextAuth v5 · Tailwind + shadcn/ui · Paystack/Monnify (server-side only) · Cloudinary · Upstash Redis · Pusher/Socket.io · Vercel deployment target.

Do not propose switching any of these without being asked — they're locked decisions from prior planning, not open questions.

## Rules that must never be violated

1. **Concurrency-safe writes only.** Capacity checks and exclusive-slot locks must be single atomic MongoDB operations (`findOneAndUpdate` with a conditional filter), never a separate read-then-write. This is the #1 source of overselling bugs in booking systems and it's already solved in the schema doc — use those patterns exactly.
2. **Webhook idempotency.** Every Paystack/Monnify webhook handler dedupes on `gatewayTransactionRef` via a unique index before mutating any state. Gateways retry on timeout; a naive handler will double-process.
3. **`activeRole` is UI context only, never an auth boundary.** Server-side checks always test `roles.includes(requiredRole)`.
4. **Two distinct booking engines**, chosen once per listing (`bookingType: 'capacity' | 'exclusive'`), never merged into one universal flow.
5. **All money is integer Kobo.** No floats, no decimals, anywhere in the financial path.
6. **New features → new files.** Don't edit or restructure existing working files unless the task explicitly requires it.

## Build order
Follow the stages in `HostMe_Build_Roadmap.md` (Foundation → Listings/Discovery → Capacity Engine → Exclusive Engine → Payments → Identity → Chat/Pass → Reviews/Disputes/Notifications → Admin CMS/Polish). Don't jump ahead to payments before the booking engines are concurrency-tested — that ordering exists because payment webhooks depend on correct slot/lock state to resolve against.

## UI requirements
Every data-driven screen needs four states: loading (skeleton, not spinner), empty, error (with retry), and pessimistic-disabled (buttons lock immediately on click). See `HostMe_Design_System.md` §7. Mobile-first always — treat `lg:` breakpoints as the enhancement layer.

## Commands (fill in once scaffolded)
```bash
npm install
npm run dev        # local dev server
npm run lint
npm test           # once test suite exists
```

## When something isn't covered in /docs
Ask, don't invent. Business logic gaps (pricing edge cases, new feature scope) should be flagged back to the user rather than assumed — several open decisions in this project were resolved by explicit conversation, not default assumptions, and that pattern should continue.
