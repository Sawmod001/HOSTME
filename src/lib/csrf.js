/**
 * CSRF protection via Origin / Referer header validation.
 *
 * Modern best practice (2025-2026):
 * - SameSite=Lax cookies prevent cross-origin POST requests from including cookies.
 * - Origin/Referer header checks provide defense-in-depth for older browsers.
 * - CSRF tokens are unnecessary when:
 *   (a) cookies are SameSite=Lax, AND
 *   (b) endpoints only accept application/json (not form-encoded).
 *
 * See: https://webjs.dev/blog/csrf-protection-without-tokens
 * See: https://vibeappscanner.com/vulnerability-in/csrf-nextjs
 * See: https://security.stackexchange.com/questions/79584157
 */

function getAllowedOrigins() {
  const raw = [
    process.env.CLOCKHOST_BASE_URL,
    process.env.HOSTME_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : null,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].filter(Boolean);

  // Support comma-separated lists (e.g. "https://hostme.in,https://hostme-xbhx.vercel.app")
  const expanded = [];
  for (const entry of raw) {
    for (const part of entry.split(",")) {
      const trimmed = part.trim();
      if (trimmed) expanded.push(trimmed.replace(/\/$/, ""));
    }
  }
  return [...new Set(expanded)];
}

function normalizeOrigin(urlStr) {
  try {
    const u = new URL(urlStr);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function isAllowedOrigin(originBase, allowedOrigins, requestHost) {
  if (allowedOrigins.includes(originBase)) return true;
  // Same-host check: if Origin host equals the request's Host header (covers preview deployments, custom domains)
  // Strict equality only - no wildcard .vercel.app bypass (prevents evil.vercel.app -> hostme.vercel.app CSRF)
  if (requestHost) {
    try {
      const originHost = new URL(originBase).host;
      if (originHost === requestHost) return true;
    } catch {}
  }
  return false;
}

/**
 * Validate that a state-changing request (POST, PUT, PATCH, DELETE) came from
 * a trusted origin. Returns a NextResponse on failure, null on success.
 *
 * Checks:
 * 1. Origin header matches an allowed origin.
 * 2. Fallback: Referer header matches an allowed origin.
 * 3. If neither header is present, allow (some legitimate clients omit them).
 *
 * @param {Request} request
 * @returns {import("next/server").NextResponse|null} 403 response if CSRF check fails
 */
export function validateCsrfOrigin(request) {
  const method = request.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null; // safe methods don't need CSRF protection
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host") || request.headers.get("x-forwarded-host") || "";

  const allowedOrigins = getAllowedOrigins();

  // If Origin is present, it must match allowed list OR same-host.
  if (origin) {
    const originBase = normalizeOrigin(origin);
    if (!originBase) {
      return new Response(
        JSON.stringify({ error: "CSRF validation failed: malformed origin" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!isAllowedOrigin(originBase, allowedOrigins, host)) {
      return new Response(
        JSON.stringify({ error: "CSRF validation failed: invalid origin" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    return null; // origin matched
  }

  // No Origin — fall back to Referer.
  if (referer) {
    const refererBase = normalizeOrigin(referer);
    if (!refererBase) {
      return new Response(
        JSON.stringify({ error: "CSRF validation failed: malformed referer" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!isAllowedOrigin(refererBase, allowedOrigins, host)) {
      return new Response(
        JSON.stringify({ error: "CSRF validation failed: invalid referer" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    return null; // referer matched
  }

  // Neither Origin nor Referer present — for state-changing requests with cookies, this is suspicious.
  // Browsers always send Origin/Referer for POST. Allow only if no session cookie (non-browser/automated clients).
  // If a session cookie is present without Origin/Referer, it's likely a forged request from a non-browser.
  const hasSessionCookie = (request.headers.get("cookie") || "").includes("__session");
  if (hasSessionCookie) {
    return new Response(
      JSON.stringify({ error: "CSRF validation failed: missing origin and referer" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
  // No session cookie + no origin/referer — likely a non-browser client (curl, webhook) — allow
  return null;
}
