import { joinGroupPlan } from "@/lib/group-booking";
import { resolveActor, issueGuest, okWithGuestCookie } from "@/lib/guest-identity";
import { rateLimitOk, clientIp } from "@/lib/rate-limit";
import { ok, fail, parseId } from "@/lib/supabase-utils";

export async function POST(request, { params }) {
    try {
        if (!rateLimitOk(`join:${clientIp(request)}`, 20)) {
            return fail("Too many attempts. Try again later.", 429);
        }

        const actor = await resolveActor(request);
        let user = actor?.user || null;
        let guestCookie = null;
        if (!user) {
            const guest = await issueGuest();
            user = guest.user;
            guestCookie = guest.cookie;
        }
        if (!user) return fail("Could not create guest session", 500);

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
        if (guestCookie) return okWithGuestCookie(result.data, result.status, guestCookie);
        return ok(result.data, result.status);
    } catch (error) {
        console.error("POST /api/group-plans/[id]/join error:", error);
        return fail("Failed to join plan", 500);
    }
}