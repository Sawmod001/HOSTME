# ClockHost Rebrand Migration Report

## Summary

Product renamed from **HostMe** to **ClockHost**. This is a controlled brand migration preserving all functionality.

## Decisions

| Item | Decision | Reason |
|---|---|---|
| Supabase storage bucket | Keep as `HOSTME` | Prevents breaking existing production images |
| Payment reference prefix | Keep `hostme-` | Prevents breaking in-flight payments |
| WhatsApp intents | Replace with ClockHost | Clean break for user input patterns |
| Logo | `Clock` + colored `Host` | Matches original split treatment |
| Tagline | Primary: "Everything You Need to Book" / Supporting: "Discover, book and manage trusted spaces and stays in one place." | New brand positioning |
| JS identifiers | Rename (`WHY_HOSTME` → `WHY_CLOCKHOST`) | Consistent naming |
| Environment variables | Rename `HOSTME_BASE_URL` → `CLOCKHOST_BASE_URL` | Clean naming |
| Default email | `admin@clockhost.com` | Follows new brand |

## Files Changed

### Brand Config (NEW)
- `src/config/brand.js` — Central brand configuration

### UI Components
- `src/components/Logo.js` — Clock + colored Host
- `src/components/ChatBot.js` — Brand name in UI
- `src/components/home/WhyHostMe.jsx` → `WhyClockHost.jsx` — Renamed component
- `src/components/home/Testimonials.jsx` — Brand name in heading
- `src/components/home/Faq.jsx` — Brand name in subtitle

### Pages
- `src/app/layout.js` — SEO metadata, title template
- `src/app/page.js` — Import renamed component
- `src/app/(auth)/sign-in/page.js` — Brand name
- `src/app/(auth)/sign-up/page.js` — Brand name
- `src/app/(auth)/complete-profile/page.js` — Brand name, terms
- `src/app/(public)/listings/[id]/checkout/page.js` — Login gate copy
- `src/app/(public)/listings/[id]/exclusive-request/page.js` — Login gate copy
- `src/app/(public)/group-plans/[id]/page.js` — Login gate copy
- `src/app/(public)/group-plans/new/page.js` — Login gate copy
- `src/app/admin-setup/page.js` — Default email
- `src/app/(admin)/admin/listings/pending/page.js` — Email subject

### Config
- `src/config/homepage.js` — Site name, tagline, FAQ, testimonials, WHY_CLOCKHOST

### API Routes
- `src/app/api/chat/route.js` — AI system prompt, fallback reply
- `src/app/api/whatsapp/webhook/route.js` — Error message, env var

### Libraries
- `src/lib/whatsapp/bot.js` — Intent strings, menu text, about text
- `src/lib/whatsapp/gemini.js` — AI system prompt
- `src/lib/csrf.js` — (No change — deployment URL stays until domain migration)

### Environment
- `.env` — Rename HOSTME_BASE_URL → CLOCKHOST_BASE_URL, update WhatsApp token

### Tests
- `tests/whatsapp-bot.test.js` — Update test assertions

### Documentation
- `README.md` — Project title, env var docs
- `docs/BOOKING-ENGINE.md` — Brand name
- `docs/VERTICAL-NAMING.md` — Brand name
- `docs/RESTRUCTURING-GUIDE.md` — Brand name
- `docs/AUTH-GATE-FIXES-AND-AUDIT.md` — Brand name
- `docs/PROBLEMS-AND-LIMITATIONS.md` — Brand name
- `docs/BATCH-1-AUTH-AUTHORIZATION.md` — Brand name
- `docs/BATCH-3-PROVIDER-VERIFICATION.md` — Brand name
- `docs/BATCH-4-HOUSING-LISTING-CALENDAR.md` — Brand name

## Intentionally Retained (Legacy)

| Reference | Location | Reason |
|---|---|---|
| `HOSTME` (storage bucket) | upload/route.js, listings/route.js, migration.sql | Production data compatibility |
| `hostme-` (payment prefix) | initiate/route.js, webhook/route.js | In-flight payment compatibility |
| `hostme-xbhx.vercel.app` | csrf.js, layout.js | Deployment URL — changes at domain migration |
| `hostme.example` | Test fixtures | Test-only, not user-facing |
| `host_id` (column name) | Database | Refers to business role, not product name |

## Not Changed (External Actions Required Later)

- GitHub repository name
- Vercel project name
- Production domain
- Clerk application name
- Paystack business name
- Supabase project name
- DNS records
