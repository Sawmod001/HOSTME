import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Booking } from "@/models/Booking";

export async function GET(request, { params }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();

        const booking = await Booking.findById(params.id).lean();
        if (!booking) {
            return Response.json({ error: "Booking not found" }, { status: 404 });
        }

        if (booking.guestId?.toString() !== session.user.id) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        return Response.json(booking);
    } catch (error) {
        console.error("GET /api/bookings/[id] error:", error);
        return Response.json({ error: "Failed to fetch booking" }, { status: 500 });
    }
}
