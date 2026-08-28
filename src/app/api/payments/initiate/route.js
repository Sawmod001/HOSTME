import crypto from "crypto";
import { requireAuthenticatedUser } from "@/lib/auth/helpers";
import { supabase } from "@/lib/db/supabase";
import { ok, fail, notFound, forbidden } from "@/lib/db/supabase-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/db/audit";
import { initializeTransaction } from "@/lib/payments/paystack";

export async function POST(request) {
    try {
        const userOrResponse = await requireAuthenticatedUser(request);
        if (userOrResponse instanceof Response) return userOrResponse;
        const user = userOrResponse;

        const rateLimited = checkRateLimit(request, { windowMs: 60_000, max: 5 }, "initiate-payment");
        if (rateLimited) return rateLimited;

        const payload = await request.json();
        const bookingId = payload?.bookingId;
        if (!bookingId) return fail("Booking ID is required", 400);

        const { data: booking } = await supabase.from("bookings").select().eq("id", bookingId).maybeSingle();
        if (!booking) return notFound("Booking not found");
        if (booking.guest_id !== user.id) return forbidden();
        if (booking.status !== "awaiting_payment") return fail("Booking is not awaiting payment", 400);

        // Check if booking has expired
        if (booking.expires_at && new Date(booking.expires_at) < new Date()) {
            await supabase.from("bookings").update({
                status: "expired",
                cancel_reason: "Payment deadline expired",
                cancelled_at: new Date().toISOString(),
            }).eq("id", bookingId);
            return fail("Booking has expired", 410);
        }

        // Check for existing successful payment
        const { data: existingPayment } = await supabase
            .from("payment_records")
            .select("id")
            .eq("booking_id", bookingId)
            .eq("status", "successful")
            .maybeSingle();

        if (existingPayment) return fail("Payment already completed", 409);

        const reference = `clockhost-${booking.id}-${crypto.randomUUID().slice(0, 8)}`;
        const callbackUrl = `${process.env.CLOCKHOST_BASE_URL || process.env.HOSTME_BASE_URL || "http://localhost:3000"}/bookings/${booking.id}/pay/confirm`;

        // Initialize Paystack transaction
        const paystackResult = await initializeTransaction({
            amountKobo: booking.total_amount_kobo,
            email: user.email,
            reference,
            callbackUrl,
            metadata: {
                booking_id: booking.id,
                guest_id: user.id,
                listing_id: booking.listing_id,
                booking_type: booking.booking_type,
            },
        });

        if (paystackResult.error) {
            return fail(paystackResult.error, 502);
        }

        // Write payment record
        const { error: paymentError } = await supabase
            .from("payment_records")
            .insert({
                booking_id: booking.id,
                amount_kobo: booking.total_amount_kobo,
                currency: "NGN",
                gateway: paystackResult.mock ? "mock" : "paystack",
                gateway_transaction_ref: reference,
                status: "pending",
                metadata: {
                    paystack_access_code: paystackResult.accessCode,
                    callback_url: callbackUrl,
                    is_mock: paystackResult.mock || false,
                },
            });

        if (paymentError) console.error("Payment record insert error:", paymentError);

        await logAudit({
            actorId: user.id,
            action: "payment.initiated",
            resourceType: "booking",
            resourceId: booking.id,
            metadata: {
                reference,
                amount_kobo: booking.total_amount_kobo,
                gateway: paystackResult.mock ? "mock" : "paystack",
            },
        });

        return ok({
            ok: true,
            data: {
                bookingId: booking.id,
                reference,
                authorization_url: paystackResult.authorizationUrl,
                accessCode: paystackResult.accessCode,
                amountKobo: booking.total_amount_kobo,
                mock: paystackResult.mock || false,
            },
        });
    } catch (error) {
        console.error("POST /api/payments/initiate error:", error);
        return fail("Failed to initiate payment", 500);
    }
}