import crypto from "crypto";
import { parseSessionToken, verifyClerkSession } from "@/lib/auth/getSessionUser";
import { getUser } from "@/lib/auth/getUser";
import { supabase } from "@/lib/db/supabase";
import { resolveExclusiveLock } from "@/lib/bookings/exclusive";
import { ok, fail, notFound, forbidden } from "@/lib/db/supabase-utils";

export async function POST(request) {
  try {
    if (process.env.NODE_ENV === "production") {
      return fail("Payments are not available yet in production", 503);
    }
    const sessionInfo = parseSessionToken(request);
    if (!sessionInfo?.userId) return fail("Unauthorized", 401);
    const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
    if (!isValid) return fail("Unauthorized", 401);

    const user = await getUser(sessionInfo.userId);
    if (!user) return fail("User not found", 404);

    const { bookingId } = await request.json();
    if (!bookingId) return fail("Booking ID is required", 400);

    const { data: booking } = await supabase.from("bookings").select().eq("id", bookingId).maybeSingle();
    if (!booking) return notFound("Booking not found");
    if (booking.guest_id !== user.id) return forbidden();
    if (booking.status !== "awaiting_payment") {
      return fail("Booking is not awaiting payment", 400);
    }

    const txRef = `mock-${booking.id}-${crypto.randomUUID().slice(0, 8)}`;

    try {
      await supabase.from("processed_webhooks").insert({
        gateway_transaction_ref: txRef,
        booking_id: booking.id,
        gateway: "mock",
      });
    } catch (err) {
      if (err?.code === "23505") {
        return ok({ received: true, duplicate: true });
      }
      throw err;
    }

    if (booking.booking_type === "exclusive") {
      const { data: lock } = await supabase
        .from("exclusive_locks")
        .select()
        .eq("listing_id", booking.listing_id)
        .eq("event_start", booking.event_start)
        .maybeSingle();

      if (!lock) return notFound("Exclusive lock not found");

      const result = await resolveExclusiveLock({
        lockId: lock.id,
        bookingId: booking.id,
        listingId: booking.listing_id,
        eventStart: booking.event_start,
      });

      if (!result.won) {
        return fail("Exclusive lock already taken by another booking", 409);
      }

      const { error: updateError } = await supabase.from("bookings").update({
        status: "confirmed",
        gateway_transaction_ref: txRef,
      }).eq("id", booking.id);

      if (updateError) throw updateError;

      return ok({
        confirmed: true,
        bookingType: "exclusive",
        won: true,
        bookingId: booking.id,
      });
    }

    const { error: updateError } = await supabase.from("bookings").update({
      status: "confirmed",
      gateway_transaction_ref: txRef,
    }).eq("id", booking.id);

    if (updateError) throw updateError;

    return ok({
      confirmed: true,
      bookingType: "capacity",
      bookingId: booking.id,
    });
  } catch (error) {
    console.error("POST /api/payments/mock-confirm error:", error);
    return fail("Failed to confirm payment", 500);
  }
}