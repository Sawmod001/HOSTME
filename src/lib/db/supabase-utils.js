// Transforms top-level snake_case keys to camelCase for API responses.
// JSONB fields (pricing, location, etc.) keep their keys as-is to preserve internal key casing.
const JSONB_COLUMNS = new Set(["pricing", "location", "operational_rules", "features", "profile", "add_ons", "media"]);

export function toCamelCase(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const doNotRecurse = JSONB_COLUMNS.has(key) || Array.isArray(value) || value instanceof Date;
    result[newKey] = value && typeof value === "object" && !doNotRecurse
      ? toCamelCase(value)
      : value;
  }
  return result;
}

export function ok(data, status = 200) {
  return Response.json(data, { status });
}

// Public GET responses can be cached at Vercel's edge CDN (s-maxage).
// stale-while-revalidate keeps serving stale data for 5 min while a single
// background invocation refreshes it — drastically cutting serverless
// invocations so the Hobby-plan request queue does not overflow.
export function cachedOk(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

export function privateOk(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

export function fail(error, status = 400) {
  const msg = typeof error === "object" && error !== null ? (error.message || JSON.stringify(error)) : String(error || "Something went wrong");
  return Response.json({ error: msg }, { status });
}

export function notFound(msg = "Not found") {
  return Response.json({ error: msg }, { status: 404 });
}

export function unauthorised(msg = "Unauthorized") {
  return Response.json({ error: msg }, { status: 401 });
}

export function forbidden(msg = "Forbidden") {
  return Response.json({ error: msg }, { status: 403 });
}

export function parseId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}