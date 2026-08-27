import { requireHost } from "@/lib/auth/helpers";
import { supabase } from "@/lib/db/supabase";
import { toCamelCase, ok, fail, notFound, forbidden, parseId } from "@/lib/db/supabase-utils";

export async function POST(request, { params }) {
    try {
    const p = await params;
    const userOrResponse = await requireHost(request);
    if (userOrResponse instanceof Response) return userOrResponse;
    const user = userOrResponse;
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