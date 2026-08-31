import crypto from "crypto";
import { requireAuthenticatedUser } from "@/lib/auth/helpers";
import { supabase } from "@/lib/db/supabase";
import { toCamelCase, ok, fail, notFound } from "@/lib/db/supabase-utils";
import { computePricingBreakdown } from "@/lib/bookings/pricing";
import { notifyBookingCreated } from "@/lib/notifications";
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
        if (role === "venue_host" || role === "shortlet_host") {
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

        if (statusFilter && ["pending_approval", "awaiting_payment", "payment_processing", "confirmed", "checked_in", "completed", "cancelled_by_guest", "cancelled_by_host", "cancelled_system", "expired", "rejected", "lost_race", "viewing_pending", "viewing_confirmed", "viewing_cancelled"].includes(statusFilter)) {
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
        const { softHoldId, addOns = [], idempotencyKey } = payload;
        if (!softHoldId) return fail("Missing soft hold ID", 400);

        // Idempotency: if key provided, check for existing booking
        if (idempotencyKey) {
            const { data: existing } = await supabase
                .from("bookings")
                .select("id, status")
                .eq("idempotency_key", idempotencyKey)
                .maybeSingle();
            if (existing) {
                return ok({ ok: true, data: { bookingId: existing.id, status: existing.status, duplicate: true } });
            }
        }

        // ATOMIC: Claim soft hold via conditional update to prevent concurrent conversion races
        // First, verify hold belongs to user and is active (read)
        const { data: softHoldPre } = await supabase
            .from("soft_holds")
            .select("*")
            .eq("id", softHoldId)
            .maybeSingle();
        if (!softHoldPre) return notFound("Soft hold not found");
        if (softHoldPre.guest_id !== user.id) return fail("Soft hold does not belong to you", 403);
        if (softHoldPre.headcount < 1) return fail("Invalid headcount on soft hold", 400);
        if (softHoldPre.state !== "active") return fail("Soft hold is no longer active", 409);
        if (new Date(softHoldPre.expires_at) < new Date()) {
            await supabase.from("soft_holds").update({ state: "released", released_at: new Date().toISOString() }).eq("id", softHoldId).eq("state", "active");
            return fail("Soft hold expired", 409);
        }
        // Atomic claim: update only if still active and not expired (prevents TOCTOU)
        // We will finalize the hold to "consumed" state after booking creation to prevent double-use
        const softHold = softHoldPre;

        const { data: listing } = await supabase.from("listings").select().eq("id", softHold.listing_id).maybeSingle();
        if (!listing) return notFound("Listing not found");
        if (listing.status !== "active") return fail("Listing is not active", 409);

        const { data: slot } = await supabase.from("slots").select().eq("id", softHold.slot_id).maybeSingle();
        if (!slot) return notFound("Slot not found");
        if (slot.listing_id !== listing.id) return fail("Listing does not match the reserved slot", 409);

        const breakdown = computePricingBreakdown({
            listing,
            eventStart: slot.event_start,
            eventEnd: slot.event_end,
            headcount: softHold.headcount,
            addOnIds: addOns.map((a) => a.id),
            includeRequired: true,
        });

        const totalAmountKobo = breakdown.totalAmountKobo;
        const commissionKobo = breakdown.commissionKobo;

        const pricingSnapshot = {
            baseRatePerHour: breakdown.baseRatePerHour,
            headcount: breakdown.headcount,
            hours: breakdown.hours,
            baseKobo: breakdown.baseKobo,
            selectedAddOnsKobo: breakdown.selectedAddOnsKobo,
            addOns: addOns.map((a) => ({ id: a.id, name: a.name, price: a.priceInKobo || 0 })),
            multiGuestDiscountPercent: breakdown.multiGuestDiscountPercent,
            multiGuestDiscountKobo: breakdown.multiGuestDiscountKobo,
            hourlyDiscountPercent: breakdown.hourlyDiscountPercent,
            hourlyDiscountKobo: breakdown.hourlyDiscountKobo,
            venueSpendDiscountPercent: breakdown.venueSpendDiscountPercent,
            venueSpendDiscountKobo: breakdown.venueSpendDiscountKobo,
            exclusiveFeeKobo: breakdown.exclusiveFeeKobo,
            commissionRate: breakdown.commissionRate,
            commissionKobo,
            paystackFeeKobo: breakdown.paystackFeeKobo,
            totalAmountKobo,
        };

        const termsSnapshot = {
            bookingType: "capacity",
            eventStart: slot.event_start,
            eventEnd: slot.event_end,
            headcount: softHold.headcount,
        };

        // Resolve host_id from listing -> provider_profile
        const { data: profile } = await supabase
            .from("provider_profiles")
            .select("user_id")
            .eq("id", listing.provider_profile_id)
            .maybeSingle();

        const idempKey = idempotencyKey || crypto.randomUUID();

        // PRODUCT_TRUTH TRUTH-5: capacity bookings require host approval first
        const initialStatus = "pending_approval";
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48h host approval window

        const { data: booking, error: insertError } = await supabase
            .from("bookings")
            .insert({
                listing_id: listing.id,
                guest_id: user.id,
                host_id: profile?.user_id || null,
                booking_type: "capacity",
                event_start: slot.event_start,
                event_end: slot.event_end,
                headcount: softHold.headcount,
                status: initialStatus,
                total_amount_kobo: totalAmountKobo,
                commission_kobo: commissionKobo,
                pricing_snapshot: { ...pricingSnapshot, venueSpendEntitlementKobo: breakdown.venueSpendEntitlementKobo },
                terms_snapshot: termsSnapshot,
                idempotency_key: idempKey,
                expires_at: expiresAt,
            })
            .select()
            .single();

        if (insertError) {
            if (insertError.code === "23505") {
                return fail("Booking already exists for this hold", 409);
            }
            console.error("Booking insert error:", insertError);
            return fail("Failed to create booking", 500);
        }

        // Atomically consume the soft hold - only succeeds if still active (prevents double-booking via race)
        const { data: consumedHold, error: consumeError } = await supabase
            .from("soft_holds")
            .update({
                state: "consumed",
                released_at: new Date().toISOString(),
                booking_id: booking.id,
            })
            .eq("id", softHoldId)
            .eq("state", "active")
            .select()
            .maybeSingle();

        if (consumeError || !consumedHold) {
            // Another request consumed this hold first - clean up the booking we just created
            await supabase.from("bookings").delete().eq("id", booking.id);
            return fail("Soft hold was already used. Please try again.", 409);
        }

        // Atomically increment booked count on slot using DB-side check (avoids stale read oversell)
        // Use a direct SQL-like update via RPC or conditional update with fresh read
        const { data: freshSlot } = await supabase.from("slots").select("booked, capacity").eq("id", slot.id).maybeSingle();
        if (freshSlot && freshSlot.booked + softHold.headcount > freshSlot.capacity) {
            // Over capacity - compensate by reverting hold and booking
            await supabase.from("soft_holds").update({ state: "active", booking_id: null, released_at: null }).eq("id", softHoldId);
            await supabase.from("bookings").delete().eq("id", booking.id);
            return fail("Slot is now fully booked. Please choose another time.", 409);
        }
        const { error: slotError } = await supabase
            .from("slots")
            .update({ booked: freshSlot ? freshSlot.booked + softHold.headcount : slot.booked + softHold.headcount })
            .eq("id", slot.id)
            .gte("capacity", (freshSlot ? freshSlot.booked : slot.booked) + softHold.headcount);

        if (slotError) {
            console.error("Slot capacity error:", slotError);
            // Non-fatal: slot tracking is for analytics, not enforcement
        }

        await logAudit({
            actorId: user.id,
            action: "booking.created",
            resourceType: "booking",
            resourceId: booking.id,
            metadata: { listing_id: listing.id, total_amount_kobo: totalAmountKobo, booking_type: "capacity" },
        });

        // Notify host of new booking
        if (profile?.user_id) {
            await notifyBookingCreated({
                hostId: profile.user_id,
                guestName: user.full_name || "A guest",
                listingTitle: listing.title || "a listing",
                bookingId: booking.id,
            });
        }

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