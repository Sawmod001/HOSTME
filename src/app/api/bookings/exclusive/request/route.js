import { requireAuthenticatedUser } from "@/lib/auth/helpers";
import { supabase } from "@/lib/db/supabase";
import { toCamelCase, ok, fail, notFound } from "@/lib/db/supabase-utils";
import { logAudit } from "@/lib/db/audit";
import { validateCsrfOrigin } from "@/lib/csrf";

export async function POST(request) {
    try {
        const csrfFail = validateCsrfOrigin(request);
        if (csrfFail) return csrfFail;

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
            .eq("status", "open")
            .maybeSingle();

        if (!exclusiveLock) return fail("Exclusive lock is not available", 409);

        const startMs = new Date(eventStart).getTime();
        const endMs = new Date(eventEnd).getTime();
        const hours = Math.max(1, (endMs - startMs) / (1000 * 60 * 60));
        const totalAmountKobo = Math.round(Number(listing.pricing?.baseRatePerHour || 0) * hours);
        const commissionKobo = Math.round(totalAmountKobo * 0.05);

        // Price snapshot: what the guest agreed to at booking time
        const pricingSnapshot = {
            baseRatePerHour: Number(listing.pricing?.baseRatePerHour) || 0,
            hours,
            totalAmountKobo,
            commissionKobo,
        };

        const termsSnapshot = {
            bookingType: "exclusive",
            eventStart,
            eventEnd,
            headcount: parsedHeadcount,
        };

        const { data: booking } = await supabase
            .from("bookings")
            .insert({
                listing_id: listingId,
                guest_id: user.id,
                booking_type: "exclusive",
                event_start: new Date(eventStart).toISOString(),
                event_end: new Date(eventEnd).toISOString(),
                headcount: parsedHeadcount,
                status: "awaiting_payment",
                total_amount_kobo: totalAmountKobo,
                commission_kobo: commissionKobo,
                pricing_snapshot: pricingSnapshot,
                terms_snapshot: termsSnapshot,
                exclusive_lock_id: lockId,
                expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            })
            .select()
            .single();

        await supabase
            .from("exclusive_locks")
            .update({ status: "reserved", booking_id: booking.id, reserved_by: user.id, reserved_at: new Date().toISOString() })
            .eq("id", lockId);

        await logAudit({
            actorId: user.id,
            action: "exclusive_lock.reserved",
            resourceType: "listing",
            resourceId: listingId,
            metadata: { bookingId: booking.id, lockId, totalAmountKobo, hours },
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
        console.error("POST /api/bookings/exclusive/request error:", error);
        return fail("Failed to request exclusive booking", 500);
    }
}