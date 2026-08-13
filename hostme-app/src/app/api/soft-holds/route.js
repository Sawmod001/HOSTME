import { supabase } from "@/lib/db/supabase";
import { parseSessionToken, verifyClerkSession } from "@/lib/auth/getSessionUser";
import { getUser } from "@/lib/auth/getUser";
import { toCamelCase, ok, fail, notFound } from "@/lib/db/supabase-utils";
import { computeCapacityPriceKobo } from "@/lib/bookings/pricing";

export async function POST(request) {
    try {
        const sessionInfo = parseSessionToken(request);
        if (!sessionInfo?.userId) return fail("Authentication required", 401);

        const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
        if (!isValid) return fail("Authentication required", 401);

        const user = await getUser(sessionInfo.userId);
        if (!user) return fail("User not found", 404);

        const payload = await request.json();
        const { listingId, slotId, headcount, guestName, guestEmail, guestPhone } = payload;
        if (!listingId || !slotId || !headcount) {
            return fail("Missing required booking details", 400);
        }

        const { data: listing } = await supabase.from("listings").select().eq("id", listingId).maybeSingle();
        if (!listing) return notFound("Listing not found");
        if (listing.booking_type !== "capacity") return fail("Listing is not capacity-based", 400);

        const { data: slot } = await supabase.from("slots").select().eq("id", slotId).maybeSingle();
        if (!slot) return notFound("Slot not found");
        if (slot.listing_id !== listingId) return fail("Slot does not belong to this listing", 400);

        const { data: updatedSlot, error } = await supabase
            .rpc("reserve_capacity_slot", {
                p_slot_id: slotId,
                p_listing_id: listingId,
                p_headcount: headcount,
            })
            .maybeSingle();

        if (error || !updatedSlot) {
            return fail("Slot is full or unavailable", 409);
        }

        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        const { data: softHold } = await supabase
            .from("soft_holds")
            .insert({
                slot_id: slotId,
                headcount,
                guest_id: user.id,
                expires_at: expiresAt.toISOString(),
                booking_id: null,
            })
            .select()
            .single();

        const totalAmountKobo = computeCapacityPriceKobo({
            listing,
            eventStart: slot.event_start,
            eventEnd: slot.event_end,
            headcount,
            addOnIds: [],
            includeRequired: true,
        });

        return ok({
            ok: true,
            data: {
                softHoldId: softHold.id,
                slotId,
                listingId,
                headcount,
                expiresAt: softHold.expires_at,
                totalAmountKobo,
                guest: { name: guestName || "Guest", email: guestEmail || null, phone: guestPhone || null },
            },
        }, 201);
    } catch (error) {
        console.error("POST /api/soft-holds error:", error);
        return fail("Failed to create soft hold", 500);
    }
}
