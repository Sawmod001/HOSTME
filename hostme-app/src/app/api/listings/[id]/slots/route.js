import { connectToDatabase } from "@/lib/db";
import { Listing } from "@/models/Listing";
import { Slot } from "@/models/Slot";
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

        if (listing.bookingType !== "capacity") {
            return Response.json({ error: "Listing is not capacity-based" }, { status: 400 });
        }

        const date = new Date(dateStr);
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const dayEnd = new Date(dayStart.getTime() + 86400000);

        const slots = await Slot.find({
            listingId: params.id,
            eventStart: { $gte: dayStart, $lt: dayEnd },
        }).lean();

        const slotsWithAvailability = slots.map((slot) => ({
            ...slot,
            available: slot.capacity - slot.booked,
            percentFilled: Math.round(((slot.booked / slot.capacity) * 100) || 0),
        }));

        return Response.json({ data: slotsWithAvailability });
    } catch (error) {
        console.error(`GET /api/listings/${params.id}/slots error:`, error);
        return Response.json({ error: "Failed to fetch slots" }, { status: 500 });
    }
}
