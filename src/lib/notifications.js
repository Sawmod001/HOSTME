import { supabase } from "@/lib/db/supabase";

/**
 * Central notification service.
 * All notifications should go through this function for consistency.
 *
 * @param {Object} params
 * @param {string} params.userId - Target user ID
 * @param {string} params.type - Notification type (e.g., 'booking_cancelled', 'payment_confirmed')
 * @param {string} params.title - Short title
 * @param {string} params.body - Notification body text
 * @param {string} [params.link] - Deep link path (e.g., '/bookings/abc123')
 * @param {Object} [params.metadata] - Additional data
 * @param {string} [params.channel] - 'in_app' | 'email' | 'push' (default: 'in_app')
 */
export async function sendNotification({ userId, type, title, body, link, metadata, channel = "in_app" }) {
  if (!userId || !type || !title || !body) {
    console.error("[Notification] Missing required fields:", { userId, type, title });
    return { ok: false, error: "Missing required notification fields" };
  }

  // Respect user notification preferences (AUDIT-NOTIF-001)
  try {
    const { data: prefs } = await supabase.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle();
    if (prefs) {
      // Check global channel toggle and per-type toggle if present
      const channelEnabled = prefs[`${channel}_enabled`] ?? prefs[channel] ?? true;
      const typeEnabled = prefs[type] ?? prefs[`type_${type}`] ?? true;
      if (channelEnabled === false || typeEnabled === false) {
        return { ok: true, skipped: true, reason: "Preference disabled" };
      }
      // Check quiet hours if set
      if (prefs.quiet_hours_start && prefs.quiet_hours_end) {
        const now = new Date();
        const hour = now.getHours();
        const start = parseInt(prefs.quiet_hours_start.split(":")[0], 10);
        const end = parseInt(prefs.quiet_hours_end.split(":")[0], 10);
        const inQuiet = start <= end ? hour >= start && hour < end : hour >= start || hour < end;
        if (inQuiet && type !== "booking_cancelled" && type !== "payment_confirmed") {
          // Skip non-urgent during quiet hours
          return { ok: true, skipped: true, reason: "Quiet hours" };
        }
      }
    }
  } catch {}

  try {
    const { error } = await supabase.from("notifications").insert({
      user_id: userId,
      type,
      title,
      body,
      link: link || null,
      metadata: metadata || {},
      channel,
      is_read: false,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[Notification] Insert error:", error);
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (err) {
    console.error("[Notification] Unexpected error:", err);
    return { ok: false, error: "Failed to send notification" };
  }
}

/**
 * Send notification to multiple users.
 */
export async function sendBulkNotifications({ userIds, type, title, body, link, metadata, channel = "in_app" }) {
  if (!userIds?.length) return { ok: true, count: 0 };

  const records = userIds.map((userId) => ({
    user_id: userId,
    type,
    title,
    body,
    link: link || null,
    metadata: metadata || {},
    channel,
    is_read: false,
    created_at: new Date().toISOString(),
  }));

  try {
    const { error } = await supabase.from("notifications").insert(records);
    if (error) {
      console.error("[Notification] Bulk insert error:", error);
      return { ok: false, error: error.message };
    }
    return { ok: true, count: records.length };
  } catch (err) {
    console.error("[Notification] Bulk unexpected error:", err);
    return { ok: false, error: "Failed to send bulk notifications" };
  }
}

// ============================================================
// Notification templates for common events
// ============================================================

export const NOTIFICATION_TYPES = {
  BOOKING_CREATED: "booking_created",
  BOOKING_APPROVED: "booking_approved",
  BOOKING_REJECTED: "booking_rejected",
  BOOKING_CANCELLED: "booking_cancelled",
  BOOKING_COMPLETED: "booking_completed",
  PAYMENT_INITIATED: "payment_initiated",
  PAYMENT_CONFIRMED: "payment_confirmed",
  PAYMENT_FAILED: "payment_failed",
  REVIEW_RECEIVED: "review_received",
  REVIEW_RESPONDED: "review_responded",
  LISTING_APPROVED: "listing_approved",
  LISTING_REJECTED: "listing_rejected",
  LISTING_SUSPENDED: "listing_suspended",
  VERIFICATION_APPROVED: "verification_approved",
  VERIFICATION_REJECTED: "verification_rejected",
  DISPUTE_OPENED: "dispute_opened",
  DISPUTE_RESOLVED: "dispute_resolved",
  VIEWING_CONFIRMED: "viewing_confirmed",
  VIEWING_CANCELLED: "viewing_cancelled",
};

/**
 * Notify host when a new booking is created.
 */
export async function notifyBookingCreated({ hostId, guestName, listingTitle, bookingId }) {
  return sendNotification({
    userId: hostId,
    type: NOTIFICATION_TYPES.BOOKING_CREATED,
    title: "New Booking Request",
    body: `${guestName} requested to book "${listingTitle}"`,
    link: `/host/bookings/${bookingId}`,
    metadata: { booking_id: bookingId },
  });
}

/**
 * Notify guest when host approves/rejects booking.
 */
export async function notifyBookingDecision({ guestId, listingTitle, bookingId, decision }) {
  const isApproved = decision === "approved";
  return sendNotification({
    userId: guestId,
    type: isApproved ? NOTIFICATION_TYPES.BOOKING_APPROVED : NOTIFICATION_TYPES.BOOKING_REJECTED,
    title: isApproved ? "Booking Approved" : "Booking Rejected",
    body: isApproved
      ? `Your booking for "${listingTitle}" has been approved. Please complete payment.`
      : `Your booking for "${listingTitle}" was not approved.`,
    link: `/bookings/${bookingId}`,
    metadata: { booking_id: bookingId, decision },
  });
}

/**
 * Notify both parties on cancellation.
 */
export async function notifyBookingCancelled({ recipientId, actorName, listingTitle, bookingId, reason }) {
  return sendNotification({
    userId: recipientId,
    type: NOTIFICATION_TYPES.BOOKING_CANCELLED,
    title: "Booking Cancelled",
    body: `${actorName} cancelled the booking for "${listingTitle}".${reason ? ` Reason: ${reason}` : ""}`,
    link: `/bookings/${bookingId}`,
    metadata: { booking_id: bookingId, reason },
  });
}

/**
 * Notify guest when payment is confirmed.
 */
export async function notifyPaymentConfirmed({ guestId, amountKobo, bookingId }) {
  return sendNotification({
    userId: guestId,
    type: NOTIFICATION_TYPES.PAYMENT_CONFIRMED,
    title: "Payment Confirmed",
    body: `Your payment of ₦${(amountKobo / 100).toFixed(2)} has been confirmed.`,
    link: `/bookings/${bookingId}`,
    metadata: { booking_id: bookingId, amount_kobo: amountKobo },
  });
}

/**
 * Notify host when a review is submitted.
 */
export async function notifyReviewReceived({ hostId, guestName, listingTitle, reviewId }) {
  return sendNotification({
    userId: hostId,
    type: NOTIFICATION_TYPES.REVIEW_RECEIVED,
    title: "New Review",
    body: `${guestName} left a review for "${listingTitle}"`,
    link: `/reviews/${reviewId}`,
    metadata: { review_id: reviewId },
  });
}

/**
 * Notify host when listing is approved/rejected.
 */
export async function notifyListingDecision({ hostId, listingTitle, listingId, decision }) {
  const isApproved = decision === "approved";
  return sendNotification({
    userId: hostId,
    type: isApproved ? NOTIFICATION_TYPES.LISTING_APPROVED : NOTIFICATION_TYPES.LISTING_REJECTED,
    title: isApproved ? "Listing Approved" : "Listing Rejected",
    body: isApproved
      ? `Your listing "${listingTitle}" is now live.`
      : `Your listing "${listingTitle}" was not approved. Please review and resubmit.`,
    link: `/host/listings/${listingId}`,
    metadata: { listing_id: listingId, decision },
  });
}

/**
 * Notify guest when viewing is confirmed.
 */
export async function notifyViewingConfirmed({ guestId, listingTitle, viewingDate, viewingId }) {
  return sendNotification({
    userId: guestId,
    type: NOTIFICATION_TYPES.VIEWING_CONFIRMED,
    title: "Viewing Confirmed",
    body: `Your viewing for "${listingTitle}" on ${viewingDate} has been confirmed.`,
    link: `/viewings/${viewingId}`,
    metadata: { viewing_id: viewingId },
  });
}
