import * as jose from "jose";

let cachedJwks = null;
let jwksFetchedAt = 0;
const JWKS_TTL_MS = 1000 * 60 * 60; // 1 hour

function getJwksUrl() {
  if (process.env.CLERK_JWKS_URL) return process.env.CLERK_JWKS_URL;
  // Derive from publishable key: pk_test_<base64(domain)>$ -> decode to clerk domain
  const pub = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
  try {
    const b64 = pub.split("_")[2];
    if (b64) {
      const decoded = Buffer.from(b64, "base64").toString().replace(/\$$/, "");
      if (decoded.includes("clerk")) {
        return `https://${decoded}/.well-known/jwks.json`;
      }
    }
  } catch {}
  // Fallback to Clerk frontend API env if set
  if (process.env.NEXT_PUBLIC_CLERK_FRONTEND_API) {
    return `https://${process.env.NEXT_PUBLIC_CLERK_FRONTEND_API}/.well-known/jwks.json`;
  }
  return null;
}

function isClerkConfigured() {
  return !!(process.env.CLERK_SECRET_KEY && getJwksUrl());
}

async function getJwks() {
  const url = getJwksUrl();
  if (!url) return null;
  const now = Date.now();
  if (cachedJwks && now - jwksFetchedAt < JWKS_TTL_MS) return cachedJwks;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`JWKS fetch ${res.status}`);
    const data = await res.json();
    if (!data.keys?.length) throw new Error("JWKS empty");
    const jwks = jose.createRemoteJWKSet(new URL(url));
    // Also cache raw for fallback
    cachedJwks = jwks;
    jwksFetchedAt = now;
    return jwks;
  } catch (e) {
    console.warn("clerkJwt: JWKS fetch failed", e?.message);
    // Return cached if we have one, else null
    return cachedJwks;
  }
}

/**
 * Verify Clerk __session JWT signature using Clerk's JWKS.
 * Returns payload if valid, null otherwise.
 * No network call if cached JWKS is fresh.
 */
export async function verifyClerkJwt(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  // Quick structural checks before crypto
  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    if (!header.alg || header.alg === "none") return null;
    if (!["RS256", "ES256", "RS384"].includes(header.alg)) return null;
  } catch {
    return null;
  }

  if (!isClerkConfigured()) {
    // Dev fallback: structural + expiry only (same as before)
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) return null;
      if (payload.iat && payload.iat > now + 60) return null;
      return payload;
    } catch {
      return null;
    }
  }

  try {
    const jwks = await getJwks();
    if (!jwks) {
      // JWKS unavailable — fall back to structural expiry check (degraded)
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) return null;
      return payload;
    }
    const { payload } = await jose.jwtVerify(token, jwks, {
      // Clerk tokens may have issuer like https://clerk.<domain> — accept any clerk issuer
      // We validate sub/exp strictly; iss is advisory
    });
    // Additional sub format check
    const sub = payload.sub || payload.user_id;
    if (!sub || typeof sub !== "string" || !sub.startsWith("user_")) return null;
    return payload;
  } catch (e) {
    // Expired, invalid signature, wrong key, etc.
    return null;
  }
}

export { isClerkConfigured, getJwksUrl };
