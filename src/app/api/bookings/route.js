import { requireAuthenticatedUser } from "@/lib/auth/helpers";
import { supabase } from "@/lib/db/supabase";
import { toCamelCase, ok, fail, notFound } from "@/lib/db/supabase-utils";
import { computeCapacityPriceKobo } from "@/lib/bookings/pricing";
import { validateCsrfOrigin } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/db/audit";

export async function GET(request) {
    try {
        const userOrResponse = await requireAuthenticatedUser(request);
        if (userOrResponse instanceof Response) return userOrResponse;
        const user = userOrResponse;

        const { searchParams } = new URL(request.url);
        const statusFilter = searchParams.get("status");

        let query = supabase.from("bookings").select();

        const role = user.role || "guest";
        if (role === "venue_host" || role === "housing_agent") {
            // Provider: fetch all their listings via provider_profile_id
            if (!user.providerProfile) return ok({ data: [] });
            const { data: listings } = await supabase
                .from("listings")
                .select("id")
                .eq("provider_profile_id", user.providerProfile.id);
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
        const csrfFail = validateCsrfOrigin(request);
        if (csrfFail) return csrfFail;

        const rateLimited = checkRateLimit(request, { windowMs: 60_000, max: 10 }, "create-booking");
        if (rateLimited) return rateLimited;

        const userOrResponse = await requireAuthenticatedUser(request);
        if (userOrResponse instanceof Response) return userOrResponse;
        const user = userOrResponse;

        const payload = await request.json();
        const { softHoldId, addOns = [] } = payload;
        if (!softHoldId) return fail("Missing soft hold ID", 400);

        const { data: softHold } = await supabase.from("soft_holds").select().eq("id", softHoldId).maybeSingle();
        if (!softHold) return notFound("Soft hold not found");
        if (new Date(softHold.expires_at) < new Date()) return fail("Soft hold expired", 409);
        if (softHold.guest_id !== user.id) return fail("Soft hold does not belong to you", 403);

        const { data: listing } = await supabase.from("listings").select().eq("id", softHold.listing_id).maybeSingle();
        if (!listing) return notFound("Listing not found");
        if (listing.status !== "active") return fail("Listing is not active", 409);

        const { data: slot } = await supabase.from("slots").select().eq("id", softHold.slot_id).maybeSingle();
        if (!slot) return notFound("Slot not found");
        // The booking's listing must be the one the slot belongs to.
        if (slot.listing_id !== listing.id) return fail("Listing does not match the reserved slot", 409);

        // Server-side add-on pricing: match requested add-ons against the
        // listing's real add-ons so clients can't manipulate prices.
        const totalAmountKobo = computeCapacityPriceKobo({
            listing,
            eventStart: slot.event_start,
            eventEnd: slot.event_end,
            headcount: softHold.headcount,
            addOnIds: addOns.map((a) => a.id),
            includeRequired: true,
        });
        const commissionKobo = Math.round(totalAmountKobo * 0.05);

        // Price snapshot: what the guest agreed to at booking time
        const pricingSnapshot = {
            baseRatePerHour: Number(listing.pricing?.baseRatePerHour) || 0,
            headcount: softHold.headcount,
            hours: Math.max(1, (new Date(slot.event_end) - new Date(slot.event_start)) / (1000 * 60 * 60)),
            addOns: addOns.map((a) => ({ id: a.id, name: a.name, price: a.priceInKobo || 0 })),
            totalAmountKobo,
            commissionKobo,
        };

        const termsSnapshot = {
            bookingType: "capacity",
            eventStart: slot.event_start,
            eventEnd: slot.event_end,
            headcount: softHold.headcount,
        };

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
                pricing_snapshot: pricingSnapshot,
                terms_snapshot: termsSnapshot,
                expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            })
            .select()
            .single();

        await supabase.from("soft_holds").update({ booking_id: booking.id, state: "converted", released_at: new Date().toISOString() }).eq("id", softHold.id);

        await logAudit({
            actorId: user.id,
            action: "booking.created",
            resourceType: "booking",
            resourceId: booking.id,
            metadata: { listing_id: listing.id, total_amount_kobo: totalAmountKobo, booking_type: "capacity" },
        });

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
        console.error("POST /api/bookings error:", error);
        return fail("Failed to create booking", 500);
    }
}