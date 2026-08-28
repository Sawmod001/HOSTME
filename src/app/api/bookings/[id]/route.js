import { parseSessionToken, verifyClerkSession } from "@/lib/auth/getSessionUser";
import { getUser } from "@/lib/auth/getUser";
import { supabase } from "@/lib/db/supabase";
import { toCamelCase, ok, fail, notFound, forbidden, parseId } from "@/lib/db/supabase-utils";

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

        // Auto-expire bookings past their expires_at window
        if (booking.status === "awaiting_payment" && booking.expires_at) {
            if (new Date(booking.expires_at) < new Date()) {
                await supabase.from("bookings").update({ status: "expired" }).eq("id", booking.id);
                booking.status = "expired";
            }
        }

        const { data: listing } = await supabase.from("listings").select("provider_profile_id, title").eq("id", booking.listing_id).maybeSingle();
        const isHost = listing && user.providerProfile?.id === listing.provider_profile_id;
        const isGuest = booking.guest_id === user.id;

        if (!isHost && !isGuest) return forbidden();

        return ok(toCamelCase({ ...booking, listingTitle: listing?.title || null }));
    } catch (error) {
        console.error("GET /api/bookings/[id] error:", error);
        return fail("Failed to fetch booking", 500);
    }
}