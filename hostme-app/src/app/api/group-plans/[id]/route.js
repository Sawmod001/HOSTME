import { getPlan } from "@/lib/group-booking";
import { parseSessionToken, verifyClerkSession } from "@/lib/getSessionUser";
import { getUser } from "@/lib/getUser";
import { ok, fail, notFound, parseId } from "@/lib/supabase-utils";

export async function GET(request, { params }) {
    try {
        const p = await params;
        if (!parseId(p.id)) return fail("Invalid plan ID", 400);

        // Public view for invite links. Resolves the caller's account so they
        // can see their own membership; unauthenticated viewers get the plan
        // without a membership.
        let userId = null;
        const sessionInfo = parseSessionToken(request);
        if (sessionInfo?.userId) {
            const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
            if (isValid) {
                const user = await getUser(sessionInfo.userId);
                if (user) userId = user.id;
            }
        }

        const plan = await getPlan({ planId: p.id, userId });
        if (!plan) return notFound("Plan not found");

        return ok({ data: plan });
    } catch (error) {
        console.error("GET /api/group-plans/[id] error:", error);
        return fail("Failed to load plan", 500);
    }
}