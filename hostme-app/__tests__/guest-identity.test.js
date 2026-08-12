import test from "node:test";
import assert from "node:assert/strict";

process.env.HOSTME_GUEST_SECRET = "test-guest-secret";
process.env.NODE_ENV = "test";

import { signGuestToken, verifyGuestToken, guestCookie, readGuestToken } from "../src/lib/guest-token.js";
import { rateLimitOk } from "../src/lib/rate-limit.js";

test("guest token round-trips", () => {
  const token = signGuestToken({ sub: "11111111-1111-1111-1111-111111111111" });
  const payload = verifyGuestToken(token);
  assert.equal(payload.sub, "11111111-1111-1111-1111-111111111111");
  assert.ok(payload.exp > Date.now());
});

test("tampered guest token is rejected", () => {
  const token = signGuestToken({ sub: "abc" });
  const [version, body] = token.split(".");
  assert.equal(verifyGuestToken(`${version}.${body}.${"0".repeat(64)}`), null);
  assert.equal(verifyGuestToken(token.slice(0, -2) + "00"), null);
});

test("expired guest token is rejected", () => {
  const token = signGuestToken({ sub: "abc", exp: Date.now() - 1000 });
  assert.equal(verifyGuestToken(token), null);
});

test("malformed guest tokens are rejected", () => {
  assert.equal(verifyGuestToken(null), null);
  assert.equal(verifyGuestToken(""), null);
  assert.equal(verifyGuestToken("garbage"), null);
  assert.equal(verifyGuestToken("v1.x.y"), null);
});

test("guest cookie carries security attributes", () => {
  const cookie = guestCookie("tok123");
  assert.match(cookie, /hostme_guest=tok123/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=/);
});

test("readGuestToken pulls the cookie from the request", () => {
  const request = { headers: { get: (name) => (name === "cookie" ? "other=1; hostme_guest=abc123; x=2" : null) } };
  assert.equal(readGuestToken(request), "abc123");
});

test("readGuestToken returns null when the cookie is absent", () => {
  const request = { headers: { get: () => null } };
  assert.equal(readGuestToken(request), null);
});

test("rate limiter allows up to the limit then blocks", () => {
  const key = `test-${Date.now()}`;
  assert.equal(rateLimitOk(key, 3, 1000), true);
  assert.equal(rateLimitOk(key, 3, 1000), true);
  assert.equal(rateLimitOk(key, 3, 1000), true);
  assert.equal(rateLimitOk(key, 3, 1000), false);
});

test("rate limiter resets after the window", () => {
  const key = `test-${Date.now()}-w`;
  rateLimitOk(key, 1, 10);
  assert.equal(rateLimitOk(key, 1, 10), false);
});
