import { supabase } from "@/lib/db/supabase";
import { logAudit } from "@/lib/db/audit";

/**
 * Booking state machine — centralized transition logic.
 *
 * Valid transitions:
 *   pending → awaiting_payment (host approves)
 *   pending → rejected (host rejects)
 *   awaiting_payment → cancelled (guest cancels or system timeout)
 *   confirmed → completed (host marks done)
 *   confirmed → cancelled (guest/host cancels)
 *
 * Usage:
 *   import { transitionBooking } from "@/lib/bookings/state-machine";
 *   const result = await transitionBooking({ bookingId, toStatus, actorId, actorRole, reason });
 */

const VALID_TRANSITIONS = {
  pending_approval: {
    awaiting_payment: ["host"],
    rejected: ["host"],
    cancelled_system: ["system"],
  },
  awaiting_payment: {
    payment_processing: ["system"],
    cancelled_by_guest: ["guest"],
    cancelled_by_host: ["host"],
    cancelled_system: ["system"],
    expired: ["system"],
  },
  payment_processing: {
    confirmed: ["system"],
    cancelled_system: ["system"],
  },
  confirmed: {
    checked_in: ["guest", "host"],
    completed: ["host"],
    cancelled_by_guest: ["guest"],
    cancelled_by_host: ["host"],
    no_show: ["host", "system"],
  },
  checked_in: {
    completed: ["host"],
  },
  // Viewing bookings: simpler flow
  viewing_pending: {
    viewing_confirmed: ["host"],
    viewing_cancelled: ["host"],
    cancelled_by_guest: ["guest"],
  },
  viewing_confirmed: {
    completed: ["host"],
    no_show: ["host", "system"],
    viewing_cancelled: ["guest", "host"],
  },
};

/**
 * Transition a booking to a new status.
 * @param {Object} params
 * @param {string} params.bookingId
 * @param {string} params.toStatus
 * @param {string} params.actorId
 * @param {'guest'|'host'|'admin'|'system'} params.actorRole
 * @param {string} [params.reason]
 * @returns {{ ok: boolean, booking?: object, error?: string }}
 */
export async function transitionBooking({ bookingId, toStatus, actorId, actorRole, reason }) {
  // 1. Fetch current booking
  const { data: booking, error: fetchError } = await supabase
    .from("bookings")
    .select("id, status, listing_id, guest_id, booking_type, slot_id, event_start, event_end")
    .eq("id", bookingId)
    .maybeSingle();

  if (fetchError || !booking) {
    return { ok: false, error: "Booking not found" };
  }

  // 2. Validate transition
  const allowed = VALID_TRANSITIONS[booking.status]?.[toStatus];
  if (!allowed) {
    return {
      ok: false,
      error: `Cannot transition from "${booking.status}" to "${toStatus}"`,
    };
  }

  if (!allowed.includes(actorRole)) {
    return {
      ok: false,
      error: `Role "${actorRole}" cannot perform this transition`,
    };
  }

  // 3. Verify ownership
  if (actorRole === "host") {
    const { data: listing } = await supabase
      .from("listings")
      .select("provider_profile_id")
      .eq("id", booking.listing_id)
      .maybeSingle();

    if (!listing) return { ok: false, error: "Listing not found" };

    const { data: profile } = await supabase
      .from("provider_profiles")
      .select("id, user_id")
      .eq("id", listing.provider_profile_id)
      .maybeSingle();

    if (!profile || profile.user_id !== actorId) {
      return { ok: false, error: "You do not own this listing" };
    }
  }

  if (actorRole === "guest" && booking.guest_id !== actorId) {
    return { ok: false, error: "You are not the guest for this booking" };
  }

  // 4. Execute transition
  const updateData = { status: toStatus, updated_at: new Date().toISOString() };
  if (toStatus === "rejected" && reason) {
    updateData.rejection_reason = reason;
  }

  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update(updateData)
    .eq("id", bookingId)
    .select()
    .single();

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  // 5. Side effects for cancellation
  if (toStatus.startsWith("cancelled_") || toStatus === "expired" || toStatus === "no_show") {
    await handleCancellation(booking, actorId);
  }

  // 6. Audit log
  const action = `booking.${toStatus === "awaiting_payment" ? "approved" : toStatus}`;
  await logAudit({
    actorId,
    action,
    resourceType: "booking",
    resourceId: bookingId,
    metadata: {
      from_status: booking.status,
      to_status: toStatus,
      booking_type: booking.booking_type,
      reason: reason || null,
    },
  });

  return { ok: true, booking: updated };
}

/**
 * Handle side effects when a booking is cancelled.
 */
async function handleCancellation(booking, actorId) {
  // Capacity: release the slot
  if (booking.booking_type === "capacity" && booking.slot_id) {
    await supabase
      .from("slots")
      .update({ status: "open", reserved_by: null, reserved_at: null })
      .eq("id", booking.slot_id)
      .eq("status", "reserved")
      .eq("reserved_by", booking.id);
  }

  // Housing: unblock dates
  if (booking.booking_type === "housing") {
    await supabase
      .from("blocked_dates")
      .delete()
      .eq("listing_id", booking.listing_id)
      .eq("booking_id", booking.id)
      .in("reason", ["booking_held", "booking_confirmed"]);

    await supabase
      .from("tenancy_periods")
      .update({ status: "available", booking_id: null })
      .eq("listing_id", booking.listing_id)
      .eq("booking_id", booking.id);
  }

  // Exclusive: release lock
  if (booking.booking_type === "exclusive") {
    await supabase
      .from("exclusive_locks")
      .update({ status: "open", booking_id: null, reserved_by: null, reserved_at: null })
      .eq("booking_id", booking.id)
      .eq("status", "reserved");
  }
}
