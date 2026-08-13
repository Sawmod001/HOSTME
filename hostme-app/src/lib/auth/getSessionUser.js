import { clerkFetch } from "@/lib/auth/clerk";

const API = "https://api.clerk.com/v1";

export function parseSessionToken(request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").filter(Boolean).map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, v.join("=")];
    })
  );
  const token = cookies["__session"];
  if (!token) return null;

  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return {
      userId: payload.sub || payload.user_id,
      sessionId: payload.sid,
    };
  } catch {
    return null;
  }
}

export async function verifyClerkSession(sessionId, expectedUserId = null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${API}/sessions/${sessionId}`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
    });
    clearTimeout(timeout);
    if (!res.ok) return false;
    const data = await res.json();
    const active = data.status === "active" || data.status === "running";
    if (!active) return false;
    // Bind the session to the user: the token's sub must match the session's
    // real user_id so a forged sub (edited cookie) can't impersonate accounts.
    if (expectedUserId && data.user_id && data.user_id !== expectedUserId) return false;
    return true;
  } catch {
    clearTimeout(timeout);
    return false;
  }
}

export async function getClerkUser(clerkUserId) {
  try {
    const clerkUser = await clerkFetch(`/users/${clerkUserId}`);
    const meta = clerkUser.public_metadata || {};
    const email = clerkUser.email_addresses?.[0]?.email_address || "";
    return {
      id: clerkUserId,
      clerk_id: clerkUserId,
      name: clerkUser.fullName || clerkUser.first_name || email || "User",
      email,
      roles: meta.roles || ["guest"],
      activeRole: meta.activeRole || "guest",
      profileCompleted: meta.profileCompleted || false,
    };
  } catch {
    return null;
  }
}