import { parseSessionToken, verifyClerkSession } from "@/lib/getSessionUser";
import { getUser } from "@/lib/getUser";
import { supabase } from "@/lib/supabase";
import { toCamelCase, ok, fail, notFound, forbidden, parseId } from "@/lib/supabase-utils";

export async function GET(request, { params }) {
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

        const { data: listing } = await supabase.from("listings").select("host_id").eq("id", booking.listing_id).maybeSingle();
        const isHost = listing && listing.host_id === user.id;
        const isGuest = booking.guest_id === user.id;

        if (!isHost && !isGuest) return forbidden();

        return ok(toCamelCase(booking));
    } catch (error) {
        console.error("GET /api/bookings/[id] error:", error);
        return fail("Failed to fetch booking", 500);
    }
}