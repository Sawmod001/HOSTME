import { createGroupPlan, listPlansForUser } from "@/lib/bookings/group-booking";
import { requireAuthenticatedUser } from "@/lib/auth/helpers";
import { rateLimitOk, clientIp } from "@/lib/rate-limit";
import { ok, fail } from "@/lib/db/supabase-utils";

export async function GET(request) {
    try {
        const userOrResponse = await requireAuthenticatedUser(request);
        if (userOrResponse instanceof Response) return ok({ data: [] });
        const user = userOrResponse;

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

        const userOrResponse = await requireAuthenticatedUser(request);
        if (userOrResponse instanceof Response) return userOrResponse;
        const user = userOrResponse;

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