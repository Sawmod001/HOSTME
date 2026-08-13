# HostMe App

Multi-vertical marketplace for Nigerian hospitality and real estate.

## Tech Stack

- **Framework**: Next.js 16 App Router (JavaScript)
- **Database**: Supabase PostgreSQL (direct connection via `pg` pool)
- **Auth**: Clerk (cookie-based JWT session, custom integration)
- **CSS**: Tailwind v4
- **Validation**: Zod v4
- **Payments**: Paystack (mock mode for dev)
- **AI**: Google Gemini (ChatBot)

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Create `.env` (gitignored) at the repo root and fill in all required values. See `.gitignore` — env files are never committed.

Required vars: `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `CLERK_SECRET_KEY`, `ADMIN_SETUP_SECRET`, `CRON_SECRET`, `PAYSTACK_SECRET_KEY`, `GEMINI_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TOKEN`, `HOSTME_BASE_URL`.

## Database Setup

Run `supabase/migration.sql` once in the Supabase SQL editor. This creates all tables, indexes, RLS policies, and stored procedures.

Key tables: `users`, `listings`, `bookings`, `slots`, `exclusive_locks`, `soft_holds`, `processed_webhooks`, `reviews`, `group_plans`, `plan_members`.

## Tests

```bash
npm test
```

## Build

```bash
npm run build
```

## Deployment

### Vercel (recommended)

1. Push to GitHub
2. Import repo in Vercel
3. Set root directory: `hostme-app`
4. Add all environment variables listed in the **Environment** section above
5. Build command: `npm run build`
6. Output: `standalone` (configured in `next.config.mjs`)

### Docker

```bash
docker build -t hostme .
docker run -p 3000:3000 --env-file .env hostme
```

Or use docker-compose:

```bash
docker compose up --build
```

### Render (alternative to Vercel)

1. Create a Web Service
2. Root dir: `hostme-app`
3. Build: `npm install && npm run build`
4. Start: `npm start`
5. Add all env vars

## Architecture Notes

- **No ClerkProvider**: Auth is handled server-side via cookie-based JWT parsing and Clerk API verification. No Clerk React SDK in the client bundle.
- **Custom PgQuery class**: Replaces Supabase JS SDK with a lightweight query builder over raw `pg` pool. Mimics Supabase's `from().select().eq()` API.
- **Docker builds**: Use `NEXT_OUTPUT=standalone` (set in Dockerfile) for minimal container images. Vercel ignores this and uses its own pipeline.
