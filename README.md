# HostMe

Multi-vertical transactional marketplace for Nigerian commercial hospitality & mid-tier real estate — venue bookings, regulated short-let viewings, and on-site pre-ordering, built on instant split-payment settlement (no escrow).

## Status
🚧 Pre-Stage-0 — repo scaffolded, full spec set complete, coding not yet started.

## Full specification
Everything the AI coding tool (or a new contributor) needs is in [`/docs`](./docs). Start with `HostMe_Build_Roadmap.md` — it defines the reading order, repo structure, environment variables, and build stages.

If you're using an AI coding assistant, it should already be reading:
- [`AGENTS.md`](./AGENTS.md) — portable instructions (Copilot, Claude Code, Cursor, Gemini all support this)
- [`.github/copilot-instructions.md`](./.github/copilot-instructions.md) — Copilot-specific repo instructions

## Tech stack
Next.js 15 (App Router) · JavaScript · MongoDB Atlas + Mongoose · NextAuth v5 · Tailwind + shadcn/ui · Paystack/Monnify · Cloudinary · Upstash Redis · Pusher/Socket.io · Vercel

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in real credentials — never commit .env.local
npm run dev
```

## Repo structure

```
/docs                  -- full specification set (read before writing code)
/.github
  copilot-instructions.md
  /instructions         -- path-specific rules, added as needed
/src
  /app                  -- Next.js App Router routes, grouped by (public)/(guest)/(host)/(admin)
  /models               -- Mongoose schemas, one file per model
  /lib                  -- gateway wrappers, chat scrubber, JWT pass encode/decode, rate limiter
  /components
    /ui                 -- shadcn primitives, themed to Design System tokens
    /booking            -- shared booking UI (capacity + exclusive variants)
AGENTS.md
README.md
```

## Build stages
See `docs/HostMe_Build_Roadmap.md` §3 for the full breakdown. Short version:

0. Foundation (scaffold, models, auth) → 1. Listings & Discovery → 2. Capacity Booking Engine → 3. Exclusive-Space Booking Engine → 4. Payments & Cancellation/Refunds → 5. Identity & Trust → 6. Chat & Digital Pass → 7. Reviews/Disputes/Notifications → 8. Admin CMS & Polish.

## Locked decisions (do not relitigate without explicit discussion)
- 95% host / 5% platform split, instant settlement, no escrow
- No KYC — lite identity + bank account-name-resolution instead
- Two booking engines: capacity-based (shared) vs exclusive-space (first-to-pay locks slot)
- Tiered cancellation policy (flexible/moderate/strict) with gateway split-refunds
- Dual-role accounts supported (`roles` array, `activeRole` is UI-only)
