import { createGroupPlan, listPlansForUser } from "@/lib/group-booking";
import { resolveActor, issueGuest, okWithGuestCookie } from "@/lib/guest-identity";
import { rateLimitOk, clientIp } from "@/lib/rate-limit";
import { ok, fail } from "@/lib/supabase-utils";

async function resolveOrIssueGuest(request) {
    const actor = await resolveActor(request);
    if (actor) return { user: actor.user, guestCookie: null };
    const guest = await issueGuest();
    return { user: guest.user, guestCookie: guest.cookie };
}

export async function GET(request) {
    try {
        const actor = await resolveActor(request);
        if (!actor) return ok({ data: [] });

        const plans = await listPlansForUser({ userId: actor.user.id });
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

        const { user, guestCookie } = await resolveOrIssueGuest(request);
        if (!user) return fail("Could not create guest session", 500);

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
        if (guestCookie) return okWithGuestCookie(result.data, result.status, guestCookie);
        return ok(result.data, result.status);
    } catch (error) {
        console.error("POST /api/group-plans error:", error);
        return fail("Failed to create plan", 500);
    }
}