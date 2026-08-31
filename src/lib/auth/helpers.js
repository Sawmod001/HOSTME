import { parseSessionToken } from "@/lib/auth/getSessionUser";
import { getUser } from "@/lib/auth/getUser";
import { fail } from "@/lib/db/supabase-utils";

/**
 * Require an authenticated user with a valid Clerk session.
 * Returns the full user object or a NextResponse error.
 *
 * Usage:
 *   const userOrResponse = await requireAuthenticatedUser(request);
 *   if (userOrResponse instanceof Response) return userOrResponse;
 *   const user = userOrResponse;
 */
export async function requireAuthenticatedUser(request) {
  const sessionInfo = await parseSessionToken(request);
  if (!sessionInfo?.userId) return fail("Unauthorized", 401);

  try {
    const user = await getUser(sessionInfo.userId);
    if (!user) return fail("User not found", 404);
    return user;
  } catch (e) {
    // DB outage during auth should be 503 not 401 null
    if (e?.message && /ECONN|ETIMEDOUT|ENOTFOUND|timeout/i.test(e.message)) {
      return fail("Authentication service temporarily unavailable", 503);
    }
    throw e;
  }
}

/**
 * Require the authenticated user to be a host (venue_host or shortlet_host).
 * Returns the full user object or a NextResponse error.
 */
export async function requireHost(request) {
  const userOrResponse = await requireAuthenticatedUser(request);
  if (userOrResponse instanceof Response) return userOrResponse;

  const user = userOrResponse;
  if (user.role !== "venue_host" && user.role !== "shortlet_host") {
    return fail("Host account required", 403);
  }

  return user;
}

/**
 * Require the authenticated user to be an admin.
 * Returns the full user object or a NextResponse error.
 */
export async function requireAdmin(request) {
  const userOrResponse = await requireAuthenticatedUser(request);
  if (userOrResponse instanceof Response) return userOrResponse;

  const user = userOrResponse;
  if (user.role !== "admin") {
    return fail("Admin access required", 403);
  }

  return user;
}
