import { supabase } from "@/lib/db/supabase";
import { resolveExclusiveLock } from "@/lib/bookings/exclusive";
import { finalizeGroupPlan } from "@/lib/bookings/group-booking";
import { verifyPaystackSignature } from "@/lib/payments/verifyWebhookSignature";
import { ok, fail } from "@/lib/db/supabase-utils";

// Refs come in the shape "<prefix>-<uuid>-<rand>"; the uuid contains dashes,
// so split("-")[1] is wrong. Extract the full uuid by trimming the fixed parts.
function extractIdFromRef(prefix, txRef) {
  if (!txRef?.startsWith(prefix + "-")) return null;
  const body = txRef.slice(prefix.length + 1);
  const lastDash = body.lastIndexOf("-");
  if (lastDash === -1) return null;
  const id = body.slice(0, lastDash);
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRe.test(id) ? id : null;
}

export async function POST(request) {
    try {
        const rawBody = await request.text();
        const signature = request.headers.get("x-paystack-signature");
        const secret = process.env.PAYSTACK_SECRET_KEY;

        // Fail closed: never skip signature verification.
        if (!secret) return fail("Webhook not configured", 503);
        if (!verifyPaystackSignature(rawBody, signature, secret)) {
            return fail("Invalid signature", 401);
        }

        const payload = JSON.parse(rawBody);
        if (payload?.event !== "charge.success") {
            return ok({ received: true, ignored: true });
        }
        if (payload?.data?.status !== "success") {
            return ok({ received: true, ignored: true });
        }

        const txRef = payload?.data?.reference;
        if (!txRef) return fail("Missing transaction reference", 400);

        try {
            await supabase.from("processed_webhooks").insert({
                gateway_transaction_ref: txRef,
                gateway: "paystack",
            });
        } catch (err) {
            if (err?.code === "23505") return ok({ received: true, duplicate: true });
            throw err;
        }

        // Group Booking crowd-pay reference: grpplan-<memberId>-<rand>.
        // Credits that member's share, then finalizes the plan once everyone
        // has paid (atomic, reuses reserve_capacity_slot). Idempotency is
        // already guaranteed by the processed_webhooks insert above.
        if (txRef.startsWith("grpplan-")) {
            const memberId = extractIdFromRef("grpplan", txRef);
            if (!memberId) return fail("Invalid reference format", 400);

            const { data: member } = await supabase.from("plan_members").select().eq("id", memberId).maybeSingle();
            if (!member) return fail("Plan member not found", 404);

            await supabase.from("plan_members").update({
                status: "paid",
                gateway_transaction_ref: txRef,
            }).eq("id", member.id);

            const result = await finalizeGroupPlan({ planId: member.plan_id });
            return ok({ received: true, finalized: result.ok });
        }

        const bookingId = extractIdFromRef("hostme", txRef);
        if (!bookingId) return fail("Invalid reference format", 400);

        const { data: booking } = await supabase.from("bookings").select().eq("id", bookingId).maybeSingle();
        if (!booking) return fail("Booking not found", 404);

        // Only ever confirm a booking that is actually awaiting payment, and
        // only if the paid amount matches the amount we expect.
        if (booking.status !== "awaiting_payment") {
            return ok({ received: true, ignored: true, status: booking.status });
        }
        const paidAmount = payload?.data?.amount;
        if (paidAmount != null && Number(paidAmount) !== Number(booking.total_amount_kobo)) {
            return fail("Amount mismatch", 400);
        }

        if (booking.booking_type === "exclusive") {
            const { data: lock } = await supabase
                .from("exclusive_locks")
                .select()
                .eq("listing_id", booking.listing_id)
                .eq("event_start", booking.event_start)
                .maybeSingle();

            if (!lock) return fail("Exclusive lock not found", 404);

            const result = await resolveExclusiveLock({
                lockId: lock.id,
                bookingId: booking.id,
                listingId: booking.listing_id,
                eventStart: booking.event_start,
            });

            // If we lost the race the booking is already marked lost_race —
            // do not override it with confirmed.
            if (!result.won) {
                return ok({ received: true, status: "lost_race" });
            }
        }

        await supabase.from("bookings").update({
            status: "confirmed",
            gateway_transaction_ref: txRef,
            paid_at: new Date().toISOString(),
        }).eq("id", booking.id);

        return ok({ received: true });
    } catch (error) {
        console.error("POST /api/payments/webhook/paystack error:", error);
        return fail("Internal error", 500);
    }
}