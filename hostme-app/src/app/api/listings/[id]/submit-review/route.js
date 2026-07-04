import { connectToDatabase } from "@/lib/db";
import { Listing } from "@/models/Listing";
import mongoose from "mongoose";

export async function POST(request, { params }) {
    try {
        const session = await import("next-auth/react").then((m) => m.getServerSession);
        if (!session) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!mongoose.Types.ObjectId.isValid(params.id)) {
            return Response.json({ error: "Invalid listing ID" }, { status: 400 });
        }

        await connectToDatabase();

        const listing = await Listing.findById(params.id);
        if (!listing) {
            return Response.json({ error: "Listing not found" }, { status: 404 });
        }

        if (listing.hostId.toString() !== session.user.id) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        if (listing.status !== "draft") {
            return Response.json({ error: "Listing is not in draft status" }, { status: 400 });
        }

        listing.status = "pending_review";
        await listing.save();

        return Response.json(listing.toObject());
    } catch (error) {
        console.error(`POST /api/listings/${params.id}/submit-review error:`, error);
        return Response.json({ error: "Failed to submit for review" }, { status: 500 });
    }
}
