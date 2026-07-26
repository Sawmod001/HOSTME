const SECRET = process.env.CLERK_SECRET_KEY;
const API = "https://api.clerk.com/v1";

function getClerkError(data) {
  if (!data?.errors?.length) return null;
  const e = data.errors[0];
  return e.long_message || e.longMessage || e.message || "Clerk API error";
}

export async function clerkFetch(path, options = {}) {
    const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

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
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(getClerkError(data));
      err.status = res.status;
      err.errors = data.errors;
      throw err;
    }
    return data;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      const err2 = new Error("Clerk API request timed out. Please check your network and try again.");
      err2.status = 408;
      throw err2;
    }
    throw err;
  }
}
