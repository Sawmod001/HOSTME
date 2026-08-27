import crypto from "crypto";
import { requireAuthenticatedUser } from "@/lib/auth/helpers";
import { supabase } from "@/lib/db/supabase";
import { ok, fail, notFound, forbidden, parseId } from "@/lib/db/supabase-utils";

export async function POST(request) {
    try {
        const userOrResponse = await requireAuthenticatedUser(request);
        if (userOrResponse instanceof Response) return userOrResponse;
        const user = userOrResponse;

        const payload = await request.json();
        const bookingId = payload?.bookingId;
        if (!bookingId) return fail("Booking ID is required", 400);

        const { data: booking } = await supabase.from("bookings").select().eq("id", bookingId).maybeSingle();
        if (!booking) return notFound("Booking not found");
        if (booking.guest_id !== user.id) return forbidden();
        if (booking.status !== "awaiting_payment") return fail("Booking is not awaiting payment", 400);

        const reference = `hostme-${booking.id}-${crypto.randomUUID().slice(0, 8)}`;
        return ok({
            ok: true,
            data: {
                bookingId: booking.id,
                reference,
                authorization_url: `https://paystack.com/pay/${reference}`,
                amountKobo: booking.total_amount_kobo,
            },
        });
    } catch (error) {
        console.error("POST /api/payments/initiate error:", error);
        return fail("Failed to initiate payment", 500);
    }
}