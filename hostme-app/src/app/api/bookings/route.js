import { parseSessionToken, verifyClerkSession } from "@/lib/getSessionUser";
import { getUser } from "@/lib/getUser";
import { supabase } from "@/lib/supabase";
import { toCamelCase, ok, fail, notFound } from "@/lib/supabase-utils";

export async function GET(request) {
    try {
        const sessionInfo = parseSessionToken(request);
        if (!sessionInfo?.userId) return fail("Unauthorized", 401);
        const isValid = await verifyClerkSession(sessionInfo.sessionId);
        if (!isValid) return fail("Unauthorized", 401);

        const user = await getUser(sessionInfo.userId);
        if (!user) return fail("User not found", 404);
        const roles = user.roles || [];

        const { searchParams } = new URL(request.url);
        const statusFilter = searchParams.get("status");

        let query = supabase.from("bookings").select();

        if (roles.includes("host")) {
            const { data: listings } = await supabase
                .from("listings")
                .select("id")
                .eq("host_id", user.id);
            const listingIds = (listings || []).map((l) => l.id);
            if (listingIds.length === 0) return ok({ data: [] });
            query = query.in("listing_id", listingIds);
        } else {
            query = query.eq("guest_id", user.id);
        }

        if (statusFilter && ["pending", "awaiting_payment", "confirmed", "rejected", "completed", "cancelled"].includes(statusFilter)) {
            query = query.eq("status", statusFilter);
        }

        const { data: bookings } = await query.order("created_at", { ascending: false });

        return ok({ data: (bookings || []).map(toCamelCase) });
    } catch (error) {
        console.error("GET /api/bookings error:", error);
        return fail("Failed to fetch bookings", 500);
    }
}

export async function POST(request) {
    try {
        const sessionInfo = parseSessionToken(request);
        if (!sessionInfo?.userId) return fail("Unauthorized", 401);
        const isValid = await verifyClerkSession(sessionInfo.sessionId);
        if (!isValid) return fail("Unauthorized", 401);

        const user = await getUser(sessionInfo.userId);
        if (!user) return fail("User not found", 404);

        const payload = await request.json();
        const { softHoldId, guestName, guestEmail, guestPhone, addOns = [] } = payload;
        if (!softHoldId) return fail("Missing soft hold ID", 400);

        const { data: softHold } = await supabase.from("soft_holds").select().eq("id", softHoldId).maybeSingle();
        if (!softHold) return notFound("Soft hold not found");
        if (new Date(softHold.expires_at) < new Date()) return fail("Soft hold expired", 409);
        if (softHold.guest_id !== user.id) return fail("Soft hold does not belong to you", 403);

        const { data: listing } = await supabase.from("listings").select().eq("id", payload.listingId).maybeSingle();
        if (!listing) return notFound("Listing not found");

        const { data: slot } = await supabase.from("slots").select().eq("id", softHold.slot_id).maybeSingle();
        if (!slot) return notFound("Slot not found");

        const addOnsTotal = addOns.reduce((sum, item) => sum + Number(item.priceInKobo || 0), 0);
        const totalAmountKobo = Number(listing.pricing?.baseRatePerHour || 0) * Number(softHold.headcount || 0) + addOnsTotal;
        const commissionKobo = Math.round(totalAmountKobo * 0.05);

        const { data: booking } = await supabase
            .from("bookings")
            .insert({
                listing_id: listing.id,
                guest_id: user.id,
                booking_type: "capacity",
                event_start: slot.event_start,
                event_end: slot.event_end,
                headcount: softHold.headcount,
                status: "awaiting_payment",
                total_amount_kobo: totalAmountKobo,
                commission_kobo: commissionKobo,
            })
            .select()
            .single();

        await supabase.from("soft_holds").update({ booking_id: booking.id }).eq("id", softHold.id);

        return ok({
            ok: true,
            data: {
                bookingId: booking.id,
                status: booking.status,
                totalAmountKobo,
                commissionKobo,
                guest: { name: guestName || "Guest", email: guestEmail || null, phone: guestPhone || null },
            },
        }, 201);
    } catch (error) {
        console.error("POST /api/bookings error:", error);
        return fail("Failed to create booking", 500);
    }
}