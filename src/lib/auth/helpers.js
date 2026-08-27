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
  const sessionInfo = parseSessionToken(request);
  if (!sessionInfo?.userId) return fail("Unauthorized", 401);

  const user = await getUser(sessionInfo.userId);
  if (!user) return fail("User not found", 404);

  return user;
}

/**
 * Require the authenticated user to be a host (venue_host or housing_agent).
 * Returns the full user object or a NextResponse error.
 */
export async function requireHost(request) {
  const userOrResponse = await requireAuthenticatedUser(request);
  if (userOrResponse instanceof Response) return userOrResponse;

  const user = userOrResponse;
  if (user.role !== "venue_host" && user.role !== "housing_agent") {
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
