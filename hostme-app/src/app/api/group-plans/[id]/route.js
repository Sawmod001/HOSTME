import { getPlan } from "@/lib/group-booking";
import { resolveActor } from "@/lib/guest-identity";
import { ok, fail, notFound, parseId } from "@/lib/supabase-utils";

export async function GET(request, { params }) {
    try {
        const p = await params;
        if (!parseId(p.id)) return fail("Invalid plan ID", 400);

        // Public view for invite links. Resolves Clerk or guest identity so the
        // viewer can see and manage their own membership without signing in.
        const actor = await resolveActor(request);
        const userId = actor?.user?.id || null;

        const plan = await getPlan({ planId: p.id, userId });
        if (!plan) return notFound("Plan not found");

        return ok({ data: plan });
    } catch (error) {
        console.error("GET /api/group-plans/[id] error:", error);
        return fail("Failed to load plan", 500);
    }
}