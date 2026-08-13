import { findUserById } from "@/lib/db/supabase-queries";
import { parseSessionToken, verifyClerkSession, getClerkUser } from "@/lib/auth/getSessionUser";
import { toCamelCase, ok, fail, notFound, unauthorised, forbidden, parseId } from "@/lib/db/supabase-utils";

export async function GET(request, { params }) {
  try {
    const p = await params;
    const sessionInfo = parseSessionToken(request);
    if (!sessionInfo?.userId) return unauthorised("No session");
    const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
    if (!isValid) return unauthorised("Invalid session");

    const adminUser = await getClerkUser(sessionInfo.userId);
    if (!adminUser) return unauthorised("Clerk user not found");
    if (!adminUser.roles?.includes("admin")) return forbidden("Admin role required");

    if (!parseId(p.id)) return fail("Invalid user ID", 400);

    const user = await findUserById(p.id);
    if (!user) return notFound("User not found");

    return ok({
      data: toCamelCase({
        id: user.id,
        name: user.name,
        email: user.email,
        profile: user.profile,
      }),
    });
  } catch (error) {
    console.error("GET /api/users/[id] error:", error);
    return fail("Failed to fetch user", 500);
  }
}