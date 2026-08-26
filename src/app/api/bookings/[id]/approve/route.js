import { parseSessionToken, verifyClerkSession } from "@/lib/auth/getSessionUser";
import { getUser } from "@/lib/auth/getUser";
import { supabase } from "@/lib/db/supabase";
import { toCamelCase, ok, fail, notFound, forbidden, parseId } from "@/lib/db/supabase-utils";

export async function POST(request, { params }) {
    try {
        const p = await params;
        const sessionInfo = parseSessionToken(request);
        if (!sessionInfo?.userId) return fail("Unauthorized", 401);
        const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
        if (!isValid) return fail("Unauthorized", 401);

        const user = await getUser(sessionInfo.userId);
        if (!user) return fail("User not found", 404);
        if (!parseId(p.id)) return fail("Invalid booking ID", 400);

        const { data: booking } = await supabase.from("bookings").select().eq("id", p.id).maybeSingle();
        if (!booking) return notFound("Booking not found");

        const { data: listing } = await supabase.from("listings").select("provider_profile_id").eq("id", booking.listing_id).maybeSingle();
        if (!listing) return notFound("Listing not found");

        if (user.providerProfile?.id !== listing.provider_profile_id) return forbidden();
        if (booking.status !== "pending") return fail("Booking is not pending approval", 400);

        const { data: updated } = await supabase
            .from("bookings")
            .update({ status: "awaiting_payment" })
            .eq("id", p.id)
            .select()
            .maybeSingle();

        return ok({ ok: true, data: toCamelCase(updated) });
    } catch (error) {
        console.error("POST /api/bookings/[id]/approve error:", error);
        return fail("Failed to approve booking", 500);
    }
}