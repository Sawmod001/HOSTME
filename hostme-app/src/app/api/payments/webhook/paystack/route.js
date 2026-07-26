import { supabase } from "@/lib/supabase";
import { resolveExclusiveLock } from "@/lib/exclusive";
import { verifyPaystackSignature } from "@/lib/payments/verifyWebhookSignature";
import { ok, fail } from "@/lib/supabase-utils";

export async function POST(request) {
    try {
        const rawBody = await request.text();
        const signature = request.headers.get("x-paystack-signature");
        const secret = process.env.PAYSTACK_SECRET_KEY;

        if (secret && !verifyPaystackSignature(rawBody, signature, secret)) {
            return fail("Invalid signature", 401);
        }

        const payload = JSON.parse(rawBody);
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

        const bookingId = txRef.split("-")[1];
        if (!bookingId) return fail("Invalid reference format", 400);

        const { data: booking } = await supabase.from("bookings").select().eq("id", bookingId).maybeSingle();
        if (!booking) return fail("Booking not found", 404);

        if (booking.booking_type === "exclusive") {
            const { data: lock } = await supabase
                .from("exclusive_locks")
                .select()
                .eq("listing_id", booking.listing_id)
                .eq("event_start", booking.event_start)
                .maybeSingle();

            if (lock) {
                await resolveExclusiveLock({
                    lockId: lock.id,
                    bookingId: booking.id,
                    listingId: booking.listing_id,
                    eventStart: booking.event_start,
                });
            }

            await supabase.from("bookings").update({
                status: "confirmed",
                gateway_transaction_ref: txRef,
            }).eq("id", booking.id);
        } else {
            await supabase.from("bookings").update({
                status: "confirmed",
                gateway_transaction_ref: txRef,
            }).eq("id", booking.id);
        }

        return ok({ received: true });
    } catch (error) {
        console.error("POST /api/payments/webhook/paystack error:", error);
        return ok({ received: true }, 200);
    }
}