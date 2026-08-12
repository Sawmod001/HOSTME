import { parseSessionToken, verifyClerkSession } from "@/lib/getSessionUser";
import { getUser } from "@/lib/getUser";
import { updateUserByClerkId } from "@/lib/supabase-queries";
import { ok, fail, unauthorised } from "@/lib/supabase-utils";

export async function GET(request) {
  try {
    const sessionInfo = parseSessionToken(request);
    if (!sessionInfo?.userId) return unauthorised("No session");
    const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
    if (!isValid) return unauthorised("Invalid session");

    const user = await getUser(sessionInfo.userId);
    if (!user) return unauthorised("User not found");

    return ok({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      roles: user.roles,
      activeRole: user.active_role,
      profile: user.profile || {},
      createdAt: user.created_at,
    });
  } catch (error) {
    console.error("GET /api/users/me error:", error);
    return fail("Failed to fetch profile", 500);
  }
}

export async function PATCH(request) {
  try {
    const sessionInfo = parseSessionToken(request);
    if (!sessionInfo?.userId) return unauthorised("No session");
    const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
    if (!isValid) return unauthorised("Invalid session");

    const user = await getUser(sessionInfo.userId);
    if (!user) return unauthorised("User not found");

    const body = await request.json();
    const updates = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.profile !== undefined) {
      const existing = user.profile || {};
      updates.profile = { ...existing, ...body.profile };
    }

    if (Object.keys(updates).length === 0) return fail("No fields to update", 400);

    const updated = await updateUserByClerkId(sessionInfo.userId, updates);
    return ok({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      roles: updated.roles,
      activeRole: updated.active_role,
      profile: updated.profile || {},
    });
  } catch (error) {
    console.error("PATCH /api/users/me error:", error);
    return fail("Failed to update profile", 500);
  }
}
