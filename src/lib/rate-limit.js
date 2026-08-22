/**
 * In-memory sliding window rate limiter.
 *
 * Works on a single Vercel function instance. Each instance maintains its own
 * counter, so the effective limit is `maxRequests × instanceCount`. For strict
 * cross-instance enforcement, swap the Map for Upstash Redis:
 *   npm install @upstash/ratelimit @upstash/redis
 * and replace the Map logic with `ratelimit.limit(key)`.
 *
 * Usage:
 *   import { rateLimit } from "@/lib/rate-limit";
 *   const limiter = rateLimit({ windowMs: 60_000, max: 10 });
 *   if (!limiter.check(ip)) return 429;
 */

const buckets = new Map();

// Periodic cleanup to prevent memory leaks from stale entries.
// Runs every 5 minutes; removes buckets whose window has fully elapsed.
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= bucket.windowMs) {
      buckets.delete(key);
    }
  }
}

/**
 * @param {object} opts
 * @param {number} opts.windowMs  - Sliding window duration in milliseconds.
 * @param {number} opts.max       - Maximum requests allowed within the window.
 * @returns {{ check: (key: string) => { allowed: boolean, remaining: number, resetMs: number } }}
 */
export function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
  return {
    check(key) {
      cleanup();

      const now = Date.now();
      let bucket = buckets.get(key);

      // Create a new bucket or reset if the window has elapsed.
      if (!bucket || now - bucket.windowStart >= windowMs) {
        bucket = { windowStart: now, count: 0 };
        buckets.set(key, bucket);
      }

      bucket.count += 1;
      const remaining = Math.max(0, max - bucket.count);
      const resetMs = windowMs - (now - bucket.windowStart);

      return { allowed: bucket.count <= max, remaining, resetMs };
    },
  };
}

/**
 * Convenience: apply a rate limit and return a NextResponse if exceeded.
 * Returns null if the request is allowed.
 *
 * @param {Request} request
 * @param {{ windowMs?: number, max?: number }} opts
 * @param {string} [keyPrefix] - Prefix for the rate limit key.
 * @returns {import("next/server").NextResponse|null}
 */
export function checkRateLimit(request, opts = {}, keyPrefix = "global") {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "anonymous";

  const limiter = rateLimit(opts);
  const { allowed, remaining, resetMs } = limiter.check(`${keyPrefix}:${ip}`);

  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": Math.ceil(resetMs / 1000).toString(),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  return null; // allowed
}

/**
 * Extract client IP from request headers.
 * @param {Request} request
 * @returns {string}
 */
export function clientIp(request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "anonymous";
}

/**
 * Simple boolean rate limit check. Returns true if allowed, false if exceeded.
 * Uses a fixed window of 60 seconds.
 *
 * @param {string} key - Unique identifier (e.g. "create:192.168.1.1")
 * @param {number} max - Max requests within the window (default 10)
 * @returns {boolean}
 */
export function rateLimitOk(key, max = 10) {
  const { allowed } = rateLimit({ windowMs: 60_000, max }).check(key);
  return allowed;
}
