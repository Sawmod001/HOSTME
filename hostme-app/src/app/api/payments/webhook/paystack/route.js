import { connectToDatabase } from "@/lib/db";
import { Booking } from "@/models/Booking";
import { resolveExclusiveLock, markWebhookProcessing } from "@/lib/exclusive";
import { ExclusiveLock } from "@/models/ExclusiveLock";
import { Listing } from "@/models/Listing";

export async function POST(request) {
    try {
        const payload = await request.json();
        const { bookingId, gatewayTransactionRef, bookingType, listingId, eventStart, lockId } = payload;

        if (!bookingId || !gatewayTransactionRef) {
            return Response.json({ received: false, error: "Missing webhook payload" }, { status: 400 });
        }

        await connectToDatabase();

        const processed = await markWebhookProcessing({
            BookingModel: Booking,
            bookingId,
            gatewayTransactionRef,
        });

        if (!processed.ok && processed.duplicate) {
            return Response.json({ received: true, duplicate: true });
        }

        const booking = await Booking.findById(bookingId).lean();
        if (!booking) {
            return Response.json({ received: false, error: "Booking not found" }, { status: 404 });
        }

        if (booking.bookingType === "exclusive") {
            const listing = await Listing.findById(listingId || booking.listingId).lean();
            if (!listing) {
                return Response.json({ received: false, error: "Listing not found" }, { status: 404 });
            }

            await resolveExclusiveLock({
                lockId: lockId || null,
                bookingId,
                listingId: listing._id,
                eventStart: eventStart || booking.eventStart,
                ExclusiveLock,
                Booking,
            });
        } else {
            await Booking.updateOne({ _id: bookingId }, { status: "confirmed" });
        }

        return Response.json({ received: true });
    } catch (error) {
        console.error("POST /api/payments/webhook/paystack error:", error);
        return Response.json({ received: false, error: "Webhook processing failed" }, { status: 500 });
    }
}
