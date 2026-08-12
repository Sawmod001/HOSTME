import { joinGroupPlan } from "@/lib/group-booking";
import { parseSessionToken, verifyClerkSession } from "@/lib/getSessionUser";
import { getUser } from "@/lib/getUser";
import { rateLimitOk, clientIp } from "@/lib/rate-limit";
import { ok, fail, parseId } from "@/lib/supabase-utils";

export async function POST(request, { params }) {
    try {
        if (!rateLimitOk(`join:${clientIp(request)}`, 20)) {
            return fail("Too many attempts. Try again later.", 429);
        }

        const sessionInfo = parseSessionToken(request);
        if (!sessionInfo?.userId) return fail("Sign in to join this plan", 401);
        const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
        if (!isValid) return fail("Sign in to join this plan", 401);

        const user = await getUser(sessionInfo.userId);
        if (!user) return fail("User not found", 404);

        const p = await params;
        if (!parseId(p.id)) return fail("Invalid plan ID", 400);

        const payload = await request.json();
        const result = await joinGroupPlan({
            user,
            planId: p.id,
            headcount: payload.headcount,
            addOns: payload.addOns,
        });

        if (!result.ok) return fail(result.error, result.status);
        return ok(result.data, result.status);
    } catch (error) {
        console.error("POST /api/group-plans/[id]/join error:", error);
        return fail("Failed to join plan", 500);
    }
}