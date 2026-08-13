const buckets = new Map();
const WINDOW_MS = 60 * 60 * 1000;

function prune() {
  const now = Date.now();
  if (buckets.size > 10000) {
    for (const [key, entry] of buckets) {
      if (now >= entry.resetAt) buckets.delete(key);
    }
  }
}

export function rateLimitOk(key, limit, windowMs = WINDOW_MS) {
  if (!key) return true;
  const now = Date.now();
  prune();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function clientIp(request) {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
