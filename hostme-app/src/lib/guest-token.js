import crypto from "crypto";

export const COOKIE_NAME = "hostme_guest";
const VERSION = "v1";
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getSecret() {
  const secret =
    process.env.HOSTME_GUEST_SECRET ||
    (process.env.NODE_ENV === "production" ? "" : "hostme-dev-guest-secret");
  if (!secret) throw new Error("HOSTME_GUEST_SECRET is not set");
  return secret;
}

function sign(data) {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("hex");
}

export function signGuestToken({ sub, exp } = {}) {
  const payload = { v: 1, sub, exp: exp || Date.now() + TOKEN_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${VERSION}.${body}.${sign(body)}`;
}

export function verifyGuestToken(token) {
  if (typeof token !== "string" || !token) return null;
  const [version, body, signature] = token.split(".");
  if (version !== VERSION || !body || !signature) return null;

  const expected = sign(body);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.v !== 1 || typeof payload.sub !== "string" || !payload.sub) return null;
    if (typeof payload.exp === "number" && payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(request) {
  const cookies = {};
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    cookies[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return cookies;
}

export function readGuestToken(request) {
  return parseCookies(request)[COOKIE_NAME] || null;
}

export function guestCookie(token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}; SameSite=Lax${secure}`;
}
