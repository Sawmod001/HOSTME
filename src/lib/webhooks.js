import crypto from "crypto";
import { supabase } from "@/lib/db/supabase";

/**
 * ClockHost Webhook Library
 * Handles outbound webhook delivery, signature generation, and retry logic.
 */

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "clockhost-webhook-default-secret";

/**
 * Generate HMAC-SHA256 signature for a payload.
 */
export function generateSignature(secret, payload) {
  return crypto
    .createHmac("sha256", secret)
    .update(typeof payload === "string" ? payload : JSON.stringify(payload))
    .digest("hex");
}

/**
 * Emit a webhook event (non-blocking).
 * Creates the event and queues deliveries for matching endpoints.
 */
export function emitEvent(eventType, payload = {}, source = "system") {
  supabase
    .rpc("emit_webhook_event", {
      p_event_type: eventType,
      p_payload: payload,
      p_source: source,
    })
    .then(({ error }) => {
      if (error) console.error("Failed to emit webhook event:", error.message);
    })
    .catch(() => {});
}

/**
 * Deliver a webhook to a single endpoint (with retry).
 * Called by the processing queue.
 */
export async function deliverWebhook(delivery) {
  const { id, attempt, max_attempts, url, secret, event_id } = delivery;

  try {
    // Fetch the event payload
    const { data: event } = await supabase
      .from("webhook_events")
      .select("event_type, payload, source")
      .eq("id", event_id)
      .single();

    if (!event) {
      await supabase.rpc("record_webhook_delivery", {
        p_delivery_id: id,
        p_status: "failed",
        p_error_message: "Event not found",
      });
      return;
    }

    // Build the webhook payload
    const body = JSON.stringify({
      id: event_id,
      type: event.event_type,
      source: event.source,
      data: event.payload,
      timestamp: new Date().toISOString(),
      attempt,
    });

    // Generate signature
    const signature = generateSignature(secret || WEBHOOK_SECRET, body);

    // Deliver with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ClockHost-Signature": signature,
        "X-ClockHost-Event": event.event_type,
        "X-ClockHost-Delivery": id,
        "User-Agent": "ClockHost-Webhooks/1.0",
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseBody = await response.text().catch(() => "");

    if (response.ok) {
      await supabase.rpc("record_webhook_delivery", {
        p_delivery_id: id,
        p_status: "success",
        p_response_status: response.status,
        p_response_body: responseBody.substring(0, 1000),
      });
    } else {
      await supabase.rpc("record_webhook_delivery", {
        p_delivery_id: id,
        p_status: "failed",
        p_response_status: response.status,
        p_response_body: responseBody.substring(0, 1000),
        p_error_message: `HTTP ${response.status}`,
      });
    }
  } catch (error) {
    await supabase.rpc("record_webhook_delivery", {
      p_delivery_id: id,
      p_status: "failed",
      p_error_message: error.message,
    });
  }
}

/**
 * Process pending webhook deliveries (batch).
 * Exposed as an API route or called from a cron job.
 */
export async function processPendingDeliveries(batchSize = 10) {
  const { data: count } = await supabase
    .rpc("process_webhook_deliveries", { p_batch_size: batchSize })
    .single();

  return count || 0;
}

/**
 * Verify a webhook signature (for inbound webhooks).
 */
export function verifySignature(secret, payload, signature) {
  const expected = generateSignature(secret, payload);
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature, "hex")
  );
}

/**
 * Event types available for webhooks.
 */
export const EVENT_TYPES = {
  BOOKING_CREATED: "booking.created",
  BOOKING_APPROVED: "booking.approved",
  BOOKING_COMPLETED: "booking.completed",
  BOOKING_CANCELLED: "booking.cancelled",
  BOOKING_REJECTED: "booking.rejected",
  PAYMENT_RECEIVED: "payment.received",
  PAYMENT_RELEASED: "payment.released",
  PAYMENT_REFUNDED: "payment.refunded",
  LISTING_CREATED: "listing.created",
  LISTING_UPDATED: "listing.updated",
  LISTING_SUSPENDED: "listing.suspended",
  DISPUTE_FILED: "dispute.filed",
  DISPUTE_RESOLVED: "dispute.resolved",
  REVIEW_POSTED: "review.posted",
  DOCUMENT_GENERATED: "document.generated",
  MESSAGE_RECEIVED: "message.received",
};
