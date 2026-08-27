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

const ALLOWED_ORIGINS = [
  process.env.CLOCKHOST_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
];

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

  // If Origin is present, it must match.
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const originBase = `${originUrl.protocol}//${originUrl.host}`;
      if (!ALLOWED_ORIGINS.includes(originBase)) {
        return new Response(
          JSON.stringify({ error: "CSRF validation failed: invalid origin" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    } catch {
      return new Response(
        JSON.stringify({ error: "CSRF validation failed: malformed origin" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    return null; // origin matched
  }

  // No Origin — fall back to Referer.
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererBase = `${refererUrl.protocol}//${refererUrl.host}`;
      if (!ALLOWED_ORIGINS.includes(refererBase)) {
        return new Response(
          JSON.stringify({ error: "CSRF validation failed: invalid referer" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    } catch {
      return new Response(
        JSON.stringify({ error: "CSRF validation failed: malformed referer" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    return null; // referer matched
  }

  // Neither Origin nor Referer present — reject (defense-in-depth).
  // Legitimate browser requests always include one of these headers.
  return new Response(
    JSON.stringify({ error: "CSRF validation failed: missing origin and referer" }),
    { status: 403, headers: { "Content-Type": "application/json" } }
  );
}
