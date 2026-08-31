const SECRET = process.env.CLERK_SECRET_KEY;
const API = "https://api.clerk.com/v1";

function getClerkError(data) {
  if (!data?.errors?.length) return null;
  const e = data.errors[0];
  return e.long_message || e.longMessage || e.message || "Clerk API error";
}

export async function clerkFetch(path, options = {}) {
  if (!SECRET) {
    const err = new Error("Authentication service is not configured (missing CLERK_SECRET_KEY).");
    err.status = 500;
    throw err;
  }
  const controller = new AbortController();
  // Vercel hobby functions timeout at 10s — keep Clerk fetch well under that.
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${API}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${SECRET}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    clearTimeout(timeout);
    let data;
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) {
      const err = new Error(getClerkError(data) || `Clerk API error (${res.status})`);
      err.status = res.status;
      err.errors = data.errors;
      throw err;
    }
    return data;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      const err2 = new Error("Authentication service timed out. Please try again in a moment.");
      err2.status = 503;
      throw err2;
    }
    // Map low-level network failures ("fetch failed", ECONNREFUSED, etc.) to user-friendly 503
    if (err.message && /fetch failed|ECONN|ENOTFOUND|UND_ERR/i.test(err.message)) {
      const err2 = new Error("Authentication service is temporarily unreachable. Please try again shortly.");
      err2.status = 503;
      err2.cause = err;
      throw err2;
    }
    throw err;
  }
}
