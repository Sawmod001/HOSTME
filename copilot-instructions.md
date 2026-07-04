# Copilot Instructions — HostMe

## What this is
HostMe is a multi-vertical Nigerian booking marketplace (venues, short-let real estate, pre-orders). Full specs live in `/docs` — always check there before generating booking, payment, or auth logic; do not invent business rules.

## Stack (locked — do not suggest alternatives)
Next.js 15 (App Router), JavaScript (not TypeScript), MongoDB Atlas + Mongoose, NextAuth v5, Tailwind + shadcn/ui, Paystack/Monnify (server-side only), Cloudinary, Upstash Redis, Pusher/Socket.io.

## Non-negotiable rules
- **Never check-then-write for capacity or slot locking.** Use single atomic `findOneAndUpdate` with `$expr`/conditional filters — see `docs/HostMe_Database_Schemas_v2.md` §2.2 and §2.4 for the exact patterns. Reading capacity then writing separately causes overselling under concurrent requests.
- **Every payment webhook handler must be idempotent** — dedupe on `gatewayTransactionRef` via the unique index, not app-level if-checks.
- **`activeRole` is never a permission boundary.** Authorization checks `roles.includes(requiredRole)` server-side, always. See `docs/HostMe_Auth_Identity_v2.md` §5.
- **Two booking engines, fixed per listing:** `capacity` (shared, sells until full) vs `exclusive` (first-to-pay locks the whole slot). Never build one universal booking flow — see PRD §2.1.
- **Money is always integer Kobo**, never float/decimal.
- **New features add new files; don't refactor existing files** unless explicitly asked.
- Mobile-first Tailwind (85%+ of traffic is mobile) — `lg:` is the enhancement layer, not the default.
- Every data-driven screen needs loading/empty/error/pessimistic-disabled states — see Design System §7. Don't ship happy-path-only components.

## Where to look before writing code
| Task | Read first |
|---|---|
| Any booking/capacity/slot logic | `docs/HostMe_Database_Schemas_v2.md` |
| Payments, refunds, cancellations | `docs/HostMe_Cancellation_Refund_Policy.md` |
| Auth, roles, identity | `docs/HostMe_Auth_Identity_v2.md` |
| API route shape | `docs/HostMe_API_Route_Contract.md` |
| Colors, type, spacing, components | `docs/HostMe_Design_System.md` |
| What to build in what order | `docs/HostMe_Build_Roadmap.md` |

## Style
Direct, minimal comments explaining *why* not *what*. No filler. Ask before assuming a business rule not covered in `/docs`.
