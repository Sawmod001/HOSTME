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