import { requireAuthenticatedUser } from "@/lib/auth/helpers";
import { toCamelCase, ok, fail, parseId } from "@/lib/db/supabase-utils";
import { transitionBooking } from "@/lib/bookings/state-machine";
import { supabase } from "@/lib/db/supabase";
import { validateCsrfOrigin } from "@/lib/csrf";

/**
 * POST /api/bookings/[id]/cancel
 * Cancel a booking. Guest or host can cancel.
 *
 * Body:
 *   { reason? }
 *
 * Rules:
 * - Guest can cancel: awaiting_payment, confirmed
 * - Host can cancel: confirmed
 * - System can cancel: awaiting_payment (expired), pending (expired)
 */
export async function POST(request, { params }) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const p = await params;
    const userOrResponse = await requireAuthenticatedUser(request);
    if (userOrResponse instanceof Response) return userOrResponse;
    const user = userOrResponse;

    if (!parseId(p.id)) return fail("Invalid booking ID", 400);

    const body = await request.json().catch(() => ({}));
    const reason = body?.reason || null;

    // Determine actor role
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, guest_id, listing_id, host_id")
      .eq("id", p.id)
      .maybeSingle();

    if (!booking) return fail("Booking not found", 404);

    let actorRole = "guest";
    if (booking.guest_id !== user.id) {
      // Check if user is the host — use host_id column if available, else join
      if (booking.host_id && booking.host_id === user.id) {
        actorRole = "host";
      } else {
        const { data: listing } = await supabase
          .from("listings")
          .select("provider_profile_id")
          .eq("id", booking.listing_id)
          .maybeSingle();

        if (listing && user.providerProfile?.id === listing.provider_profile_id) {
          actorRole = "host";
        } else {
          return fail("Not authorized to cancel this booking", 403);
        }
      }
    }

    const result = await transitionBooking({
      bookingId: p.id,
      toStatus: actorRole === "host" ? "cancelled_by_host" : "cancelled_by_guest",
      actorId: user.id,
      actorRole,
      reason,
    });

    if (!result.ok) return fail(result.error, 400);

    // Send notification to the other party using host_id column
    const notifyUserId = actorRole === "guest" ? booking.host_id : booking.guest_id;
    if (notifyUserId) {
      const actorName = user.full_name || "Someone";
      const { data: listing } = await supabase
        .from("listings")
        .select("title")
        .eq("id", booking.listing_id)
        .maybeSingle();

      await supabase.from("notifications").insert({
        user_id: notifyUserId,
        type: "booking_cancelled",
        title: "Booking Cancelled",
        body: `${actorName} cancelled the booking for "${listing?.title || "a listing"}".${reason ? ` Reason: ${reason}` : ""}`,
        link: actorRole === "guest" ? "/host/bookings" : "/dashboard",
        metadata: { booking_id: p.id },
      });
    }

    return ok({ ok: true, data: toCamelCase(result.booking) });
  } catch (error) {
    console.error("POST /api/bookings/[id]/cancel error:", error);
    return fail("Failed to cancel booking", 500);
  }
}
