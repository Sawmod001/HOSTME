# HostMe — Auth Gate Fixes & Code Audit Report

## Overview

This document covers the auth gate vulnerability fixes, bug fixes, and comprehensive code audit findings discovered during the HostMe pre-launch restructuring.

---

## 1. Auth Gate Fixes

### 1.1 Race Condition: `gate()` Called Before Auth State Resolved

**File:** `src/app/page.js`

**Problem:** The `gate` function checks `isAuthenticated` to decide whether to redirect to sign-in or allow navigation. But on page load, `gate()` can be called before `useEffect` finishes checking the session. This means:
- User clicks "Get Started" → `gate()` runs → `isAuthenticated` is still `false` → user redirected to `/auth/sign-in` even though they're logged in
- User clicks again → this time auth check has completed → `isAuthenticated` is `true` → navigation works
- Result: **first click always fails if user is already signed in**

**Fix:** Added `authChecked` boolean. If `gate()` fires before auth is resolved, it calls `e.preventDefault()` + `e.stopPropagation()` and returns early. The click event is suppressed rather than causing a wrong redirect.

**Files changed:** `src/app/page.js`

### 1.2 Button Navigation: `event.currentTarget` Mismatch

**File:** `src/app/page.js`

**Problem:** The `gate` function was attached to both `<a>` and `<button>` elements. For `<a>` tags, `router.push(href)` works fine via the anchor's `href`. But for `<button>` elements (like the two booking CTA buttons in `TwoWaysToBook`), the `href` is `undefined` — buttons don't have `href`. The gate function would call `router.push(undefined)` which is a no-op.

**Fix:** Added explicit `router.push(href)` call when `e.currentTarget?.tagName === "BUTTON"` and the user is authenticated.

**Files changed:** `src/app/page.js`

### 1.3 HostCta: Missing `gate()` on "List Your Space" CTA

**File:** `src/components/home/HostCta.jsx`

**Problem:** The "List your space" button in the host CTA section navigated directly to `/host/listings/new` without checking auth. Unauthenticated users would land on a protected route and get a confusing server error or blank page instead of a clean sign-in redirect.

**Fix:** Added `gate` prop from page.js. CTA button now calls `gate(e, HOST_CTA.primaryCta.href)` which redirects unauthenticated users to sign-in first.

**Files changed:** `src/components/home/HostCta.jsx`, `src/app/page.js` (passing gate prop)

### 1.4 FeaturedSpaces: Empty State "Get Notified" Link Bypasses Auth

**File:** `src/components/home/FeaturedSpaces.jsx`

**Problem:** The "Get notified" link in the empty state (shown when no listings match the selected category) navigated directly without auth gating. If a user is not signed in, clicking this would land on a page requiring auth.

**Fix:** Added `gate` prop and applied it to the "Get notified" link, same pattern as other gated CTAs.

**Files changed:** `src/components/home/FeaturedSpaces.jsx`, `src/app/page.js` (passing gate prop)

---

## 2. Bug Fixes

### 2.1 Reviews API 500 Error

**File:** `src/lib/db/supabase-queries.js`

**Problem:** The `listReviews` function used a complex Supabase join: `supabase.from("reviews").select("*, profiles!reviews_user_id_fkey(full_name, avatar_url)")`. The join failed because the foreign key constraint name didn't match or the join syntax was wrong for the Supabase version, causing a 500 error on any listing with reviews.

**Fix:** Simplified to `supabase.from("reviews").select("*")` — returns all review columns without the join. The profile data (name, avatar) can be fetched separately or the join can be re-added with the correct FK name later.

### 2.2 addOns Shape Mismatch

**File:** `src/app/(public)/listings/[id]/page.js`

**Problem:** The listing detail page assumed `addOns` was always an array. If a listing has `addOns: null` or `addOns: {}` in the database, the page would crash with "Cannot read properties of undefined (reading filter)".

**Fix:** Added `Array.isArray(addOns) ? addOns : []` guard before any `addOns.map()` or `addOns.filter()` calls.

### 2.3 Title Whitespace on Create/Update

**File:** `src/app/api/listings/route.js`, `src/app/api/listings/[id]/route.js`

**Problem:** A user could create a listing with title `"   "` (just spaces) which would pass validation but display as a blank title in the UI and search results.

**Fix:** Added `.trim()` to `title` before saving in both create (POST) and update (PATCH) handlers.

### 2.4 addOns Normalization in PATCH

**File:** `src/app/api/listings/[id]/route.js`

**Problem:** If the PATCH body contained `addOns: "[]"` (a string instead of an array), it would be stored as a string in the database, causing downstream code to fail when trying to `JSON.parse` it or iterate over it.

**Fix:** Added normalization: `if (typeof addOns === "string") addOns = JSON.parse(addOns)` before saving.

---

## 3. Security Issues Found During Audit

These are documented for future fixing but NOT yet patched.

### 3.1 CRITICAL: Middleware Auth Bypass on Exception

**File:** `src/middleware.js`

**Problem:** The auth middleware has a `try/catch` that redirects to `/auth/sign-in` on error. But if Supabase throws an exception (network timeout, invalid token format, etc.), the catch block redirects — meaning **any middleware error becomes an auth bypass**. An attacker could craft a malformed auth cookie that causes Supabase to throw, and the middleware would redirect them to sign-in instead of blocking access.

**Severity:** CRITICAL — affects all protected routes.

### 3.2 CRITICAL: No Rate Limiting on Auth Endpoints

**Files:** `src/app/api/auth/callback/route.js`, `src/app/api/auth/signin/route.js`, `src/app/api/auth/signup/route.js`

**Problem:** No rate limiting on any authentication endpoint. An attacker can:
- Brute force passwords with unlimited attempts
- Create unlimited accounts (if email verification is weak)
- Enumerate valid email addresses by observing response timing

**Severity:** CRITICAL — direct path to account compromise.

### 3.3 HIGH: Sign-In Timing Side-Channel

**File:** `src/app/api/auth/signin/route.js`

**Problem:** Login responses take different amounts of time depending on whether the email exists. An attacker can measure response times to enumerate valid email addresses before attempting password attacks.

**Severity:** HIGH — enables targeted brute force.

### 3.4 HIGH: Missing Auth on Admin Routes

**Files:** `src/app/api/admin/approve-listing/route.js`, `src/app/api/admin/reject-listing/route.js`

**Problem:** Admin approve/reject endpoints don't verify that the caller is actually an admin. Any authenticated user (or anyone who finds the endpoint) can approve or reject listings.

**Severity:** HIGH — unauthorized listing moderation.

### 3.5 MEDIUM: No CSRF Protection

**Problem:** POST/PUT/DELETE endpoints don't verify CSRF tokens. An attacker could craft a malicious page that makes requests to HostMe APIs on behalf of a logged-in user.

**Severity:** MEDIUM — requires user to visit a malicious page while logged in.

### 3.6 LOW: In-Memory Rate Limiting Ineffective on Vercel

**Problem:** Rate limiting is implemented in-memory (`Map`), which doesn't work on Vercel's serverless functions (each request may hit a different instance).

**Severity:** LOW — rate limits are effectively disabled in production.

---

## 4. Architecture Issues Found During Audit

### 4.1 Monolithic Listing Detail Page

**File:** `src/app/(public)/listings/[id]/page.js`

**Problem:** ~470 lines of mixed concerns (data fetching, UI rendering, booking logic, review display, map integration, share functionality). Very hard to maintain or test.

### 4.2 No Server Components

**Problem:** The entire app uses client components (`"use client"`). This defeats Next.js's server rendering benefits — no streaming, no partial hydration, larger bundle sizes.

### 4.3 No Image Optimization

**Problem:** Listing images are displayed as raw `<img>` tags or basic `next/image` without proper `sizes`, `priority`, or blur placeholders. Slow image loads on mobile.

### 4.4 No Email Notifications

**Problem:** No email system exists. Users receive no emails for:
- Booking confirmations
- Payment receipts
- Listing approval/rejection
- New booking requests (for hosts)

### 4.5 No Structured Data

**Problem:** No JSON-LD or Open Graph tags for SEO. Listings don't show up in Google search results with rich snippets (price, rating, availability).

### 4.6 No Error Boundaries

**Problem:** No React error boundaries. If a component crashes, the entire page goes white with no recovery.

### 4.7 No Monitoring/Logging

**Problem:** No error tracking (Sentry, etc.), no analytics, no performance monitoring. Issues in production are invisible until users report them.

---

## 5. Recommended Fix Priority

| Priority | Issue | Effort |
|---|---|---|
| 1 | Middleware auth bypass | 30 min |
| 2 | Rate limiting on auth | 1 hr |
| 3 | Admin route auth | 15 min |
| 4 | Timing side-channel | 30 min |
| 5 | CSRF protection | 1 hr |
| 6 | Email notifications | 2-3 days |
| 7 | Server Components migration | 1-2 weeks |
| 8 | Listing detail refactor | 1 week |
| 9 | Image optimization | 2 hrs |
| 10 | Error boundaries | 1 hr |
