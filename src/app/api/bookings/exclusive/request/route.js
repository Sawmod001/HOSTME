import { requireAuthenticatedUser } from "@/lib/auth/helpers";
import { supabase } from "@/lib/db/supabase";
import { toCamelCase, ok, fail, notFound } from "@/lib/db/supabase-utils";

export async function POST(request) {
    try {
        const userOrResponse = await requireAuthenticatedUser(request);
        if (userOrResponse instanceof Response) return userOrResponse;
        const user = userOrResponse;

        const payload = await request.json();
        const { listingId, lockId, headcount, eventStart, eventEnd } = payload;
        if (!listingId || !lockId || !headcount || !eventStart || !eventEnd) {
            return fail("Missing required booking details", 400);
        }

        const parsedHeadcount = Number(headcount);
        if (!Number.isFinite(parsedHeadcount) || parsedHeadcount < 1) {
            return fail("Headcount must be at least 1", 400);
        }

        const { data: listing } = await supabase.from("listings").select().eq("id", listingId).maybeSingle();
        if (!listing) return notFound("Listing not found");
        if (listing.booking_type !== "exclusive") return fail("Listing is not exclusive-space", 400);
        if (listing.status !== "active") return fail("Listing is not active", 400);

        const { data: exclusiveLock } = await supabase
            .from("exclusive_locks")
            .select()
            .eq("id", lockId)
            .eq("listing_id", listingId)
            .eq("event_start", new Date(eventStart).toISOString())
            .eq("status", "open")
            .maybeSingle();

        if (!exclusiveLock) return fail("Exclusive lock is not available", 409);

        const startMs = new Date(eventStart).getTime();
        const endMs = new Date(eventEnd).getTime();
        const hours = Math.max(1, (endMs - startMs) / (1000 * 60 * 60));
        const totalAmountKobo = Math.round(Number(listing.pricing?.baseRatePerHour || 0) * hours);
        const commissionKobo = Math.round(totalAmountKobo * 0.05);

        const { data: booking } = await supabase
            .from("bookings")
            .insert({
                listing_id: listingId,
                guest_id: user.id,
                booking_type: "exclusive",
                event_start: new Date(eventStart).toISOString(),
                event_end: new Date(eventEnd).toISOString(),
                headcount: parsedHeadcount,
                status: "pending",
                total_amount_kobo: totalAmountKobo,
                commission_kobo: commissionKobo,
            })
            .select()
            .single();

        return ok({
            ok: true,
            data: {
                bookingId: booking.id,
                status: booking.status,
                totalAmountKobo,
                commissionKobo,
            },
        }, 201);
    } catch (error) {
        console.error("POST /api/bookings/exclusive/request error:", error);
        return fail("Failed to request exclusive booking", 500);
    }
}