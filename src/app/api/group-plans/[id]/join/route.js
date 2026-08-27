import { joinGroupPlan } from "@/lib/bookings/group-booking";
import { requireAuthenticatedUser } from "@/lib/auth/helpers";
import { rateLimitOk, clientIp } from "@/lib/rate-limit";
import { ok, fail, parseId } from "@/lib/db/supabase-utils";

export async function POST(request, { params }) {
    try {
        if (!rateLimitOk(`join:${clientIp(request)}`, 20)) {
            return fail("Too many attempts. Try again later.", 429);
        }

        const userOrResponse = await requireAuthenticatedUser(request);
        if (userOrResponse instanceof Response) return userOrResponse;
        const user = userOrResponse;

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