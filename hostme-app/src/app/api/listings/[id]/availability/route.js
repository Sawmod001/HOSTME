import { connectToDatabase } from "@/lib/db";
import { Listing } from "@/models/Listing";
import { ExclusiveLock } from "@/models/ExclusiveLock";
import mongoose from "mongoose";

export async function GET(request, { params }) {
    try {
        const { searchParams } = new URL(request.url);
        const dateStr = searchParams.get("date");

        if (!dateStr) {
            return Response.json({ error: "Missing date query parameter" }, { status: 400 });
        }

        if (!mongoose.Types.ObjectId.isValid(params.id)) {
            return Response.json({ error: "Invalid listing ID" }, { status: 400 });
        }

        await connectToDatabase();

        const listing = await Listing.findById(params.id).lean();
        if (!listing) {
            return Response.json({ error: "Listing not found" }, { status: 404 });
        }

        if (listing.bookingType !== "exclusive") {
            return Response.json({ error: "Listing is not exclusive-space" }, { status: 400 });
        }

        const date = new Date(dateStr);
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const dayEnd = new Date(dayStart.getTime() + 86400000);

        const locks = await ExclusiveLock.find({
            listingId: params.id,
            eventStart: { $gte: dayStart, $lt: dayEnd },
        }).lean();

        const availability = locks.map((lock) => ({
            _id: lock._id,
            eventStart: lock.eventStart,
            eventEnd: lock.eventEnd,
            status: lock.status,
            lockedByBookingId: lock.lockedByBookingId,
        }));

        return Response.json({ data: availability });
    } catch (error) {
        console.error(`GET /api/listings/${params.id}/availability error:`, error);
        return Response.json({ error: "Failed to fetch availability" }, { status: 500 });
    }
}
