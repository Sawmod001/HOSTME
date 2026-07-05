import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Booking } from "@/models/Booking";
import { Listing } from "@/models/Listing";

export async function POST(request, { params }) {
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

        const listing = await Listing.findById(booking.listingId).lean();
        if (!listing) {
            return Response.json({ error: "Listing not found" }, { status: 404 });
        }

        if (!session.user.roles?.includes("host") || listing.hostId.toString() !== session.user.id) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        if (booking.status !== "pending") {
            return Response.json({ error: "Booking is not pending approval" }, { status: 400 });
        }

        const updated = await Booking.findByIdAndUpdate(
            params.id,
            { status: "awaiting_payment" },
            { new: true }
        );

        return Response.json({ ok: true, data: updated });
    } catch (error) {
        console.error("POST /api/bookings/[id]/approve error:", error);
        return Response.json({ error: "Failed to approve booking" }, { status: 500 });
    }
}
