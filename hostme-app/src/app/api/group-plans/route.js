import { createGroupPlan, listPlansForUser } from "@/lib/bookings/group-booking";
import { parseSessionToken, verifyClerkSession } from "@/lib/auth/getSessionUser";
import { getUser } from "@/lib/auth/getUser";
import { rateLimitOk, clientIp } from "@/lib/rate-limit";
import { ok, fail } from "@/lib/db/supabase-utils";

export async function GET(request) {
    try {
        const sessionInfo = parseSessionToken(request);
        if (!sessionInfo?.userId) return ok({ data: [] });
        const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
        if (!isValid) return ok({ data: [] });

        const user = await getUser(sessionInfo.userId);
        if (!user) return ok({ data: [] });

        const plans = await listPlansForUser({ userId: user.id });
        return ok({ data: plans });
    } catch (error) {
        console.error("GET /api/group-plans error:", error);
        return fail("Failed to fetch plans", 500);
    }
}

export async function POST(request) {
    try {
        if (!rateLimitOk(`create:${clientIp(request)}`, 10)) {
            return fail("Too many plans created. Try again later.", 429);
        }

        const sessionInfo = parseSessionToken(request);
        if (!sessionInfo?.userId) return fail("Unauthorized", 401);
        const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
        if (!isValid) return fail("Unauthorized", 401);

        const user = await getUser(sessionInfo.userId);
        if (!user) return fail("User not found", 404);

        const payload = await request.json();
        const result = await createGroupPlan({
            user,
            listingId: payload.listingId,
            slotId: payload.slotId,
            targetHeadcount: payload.targetHeadcount,
            expiresAt: payload.expiresAt,
            headcount: payload.headcount,
            addOns: payload.addOns,
        });

        if (!result.ok) return fail(result.error, result.status);
        return ok(result.data, result.status);
    } catch (error) {
        console.error("POST /api/group-plans error:", error);
        return fail("Failed to create plan", 500);
    }
}