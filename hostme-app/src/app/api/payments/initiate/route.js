import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Booking } from "@/models/Booking";

export async function POST(request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const payload = await request.json();
        const bookingId = payload?.bookingId;
        if (!bookingId) {
            return Response.json({ error: "Booking ID is required" }, { status: 400 });
        }

        await connectToDatabase();

        const booking = await Booking.findById(bookingId).lean();
        if (!booking) {
            return Response.json({ error: "Booking not found" }, { status: 404 });
        }

        if (booking.guestId?.toString() !== session.user.id) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        if (booking.status !== "awaiting_payment") {
            return Response.json({ error: "Booking is not awaiting payment" }, { status: 400 });
        }

        const reference = `hostme-${booking._id}-${Date.now()}`;
        return Response.json({
            ok: true,
            data: {
                bookingId: booking._id,
                reference,
                authorization_url: `https://paystack.com/pay/${reference}`,
                amountKobo: booking.totalAmountKobo,
            },
        });
    } catch (error) {
        console.error("POST /api/payments/initiate error:", error);
        return Response.json({ error: "Failed to initiate payment" }, { status: 500 });
    }
}
