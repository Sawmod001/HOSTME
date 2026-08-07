# HostMe

Multi-vertical transactional marketplace for Nigerian commercial hospitality & mid-tier real estate — venue bookings, regulated short-let viewings, and on-site pre-ordering, built on instant split-payment settlement (no escrow).

## Status
Production app live on Vercel. Backend runs on Supabase PostgreSQL with Clerk authentication. See `hostme-app/README.md` for setup.

## Tech Stack
Next.js 16 (App Router) · JavaScript · Supabase PostgreSQL · Clerk Auth · Tailwind v4 · Paystack · Google Gemini (ChatBot) · Vercel

## Getting Started

```bash
cd hostme-app
npm install
cp .env.example .env.local   # fill in real credentials — never commit .env.local
npm run dev
```

## Repo Structure

```
/hostme-app            -- Next.js application (see hostme-app/README.md)
  /src
    /app/api           -- API routes (Supabase + Clerk)
    /lib               -- supabase client, query helpers, Clerk helpers, validation
  /supabase
    migration.sql      -- full PostgreSQL schema (run in Supabase SQL editor)
```

## Build Stages
0. Foundation → 1. Listings & Discovery → 2. Capacity Booking Engine → 3. Exclusive-Space Booking Engine → 4. Payments & Cancellation/Refunds → 5. Identity & Trust → 6. Chat & Digital Pass → 7. Reviews/Disputes/Notifications → 8. Admin CMS & Polish.

## Locked Decisions
- 95% host / 5% platform split, instant settlement, no escrow
- No KYC — lite identity + bank account-name-resolution instead
- Two booking engines: capacity-based (shared) vs exclusive-space (first-to-pay locks slot)
- Tiered cancellation policy with gateway split-refunds
- Dual-role accounts supported (`roles` array, `activeRole` is UI-only)
