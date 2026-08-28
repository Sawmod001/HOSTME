import { requireHost } from "@/lib/auth/helpers";
import { supabase } from "@/lib/db/supabase";
import { toCamelCase, ok, fail, parseId } from "@/lib/db/supabase-utils";
import { transitionBooking } from "@/lib/bookings/state-machine";
import { notifyBookingDecision } from "@/lib/notifications";
import { validateCsrfOrigin } from "@/lib/csrf";

export async function POST(request, { params }) {
    try {
        const csrfFail = validateCsrfOrigin(request);
        if (csrfFail) return csrfFail;

        const p = await params;
        const userOrResponse = await requireHost(request);
        if (userOrResponse instanceof Response) return userOrResponse;
        const user = userOrResponse;

        const payload = await request.json();
        const reason = payload?.reason?.trim();
        if (!reason) return fail("Reason is required", 400);
        if (!parseId(p.id)) return fail("Invalid booking ID", 400);

        const result = await transitionBooking({
            bookingId: p.id,
            toStatus: "rejected",
            actorId: user.id,
            actorRole: "host",
            reason,
        });

        if (!result.ok) return fail(result.error, 400);

        // Notify guest
        const { data: booking } = await supabase
            .from("bookings")
            .select("guest_id, listing_id")
            .eq("id", p.id)
            .maybeSingle();

        if (booking) {
            const { data: listing } = await supabase
                .from("listings")
                .select("title")
                .eq("id", booking.listing_id)
                .maybeSingle();

            await notifyBookingDecision({
                guestId: booking.guest_id,
                listingTitle: listing?.title || "a listing",
                bookingId: p.id,
                decision: "rejected",
            });
        }

        return ok({ ok: true, data: toCamelCase(result.booking) });
    } catch (error) {
        console.error("POST /api/bookings/[id]/reject error:", error);
        return fail("Failed to reject booking", 500);
    }
}