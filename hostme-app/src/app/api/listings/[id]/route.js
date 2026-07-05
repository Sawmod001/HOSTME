import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Listing } from "@/models/Listing";
import { validateListingUpdate } from "@/lib/validation";
import { getDemoListingById } from "@/lib/demo-data";
import mongoose from "mongoose";

export async function GET(request, { params }) {
    try {
        if (!mongoose.Types.ObjectId.isValid(params.id)) {
            return Response.json({ error: "Invalid listing ID" }, { status: 400 });
        }

        try {
            await connectToDatabase();

            const listing = await Listing.findById(params.id).lean();
            if (!listing) {
                return Response.json({ error: "Listing not found" }, { status: 404 });
            }

            return Response.json(listing);
        } catch (databaseError) {
            const demoListing = getDemoListingById(params.id);
            if (!demoListing) {
                return Response.json({ error: "Listing not found" }, { status: 404 });
            }

            return Response.json(demoListing);
        }
    } catch (error) {
        console.error(`GET /api/listings/${params.id} error:`, error);
        return Response.json({ error: "Failed to fetch listing" }, { status: 500 });
    }
}

export async function PATCH(request, { params }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
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

        if (listing.hostId.toString() !== session.user.id && session.user.roles?.includes("admin") !== true) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        if (listing.status !== "draft") {
            return Response.json(
                { error: "Can only update listings in draft status" },
                { status: 400 }
            );
        }

        const payload = await request.json();
        const validation = validateListingUpdate(payload);
        if (!validation.success) {
            return Response.json({ error: "Invalid payload", issues: validation.error.issues }, { status: 400 });
        }

        Object.assign(listing, validation.data);
        if (validation.data.location?.coordinates) {
            listing.location.coordinates = [
                validation.data.location.coordinates.longitude,
                validation.data.location.coordinates.latitude,
            ];
        }

        await listing.save();
        return Response.json(listing.toObject());
    } catch (error) {
        console.error(`PATCH /api/listings/${params.id} error:`, error);
        return Response.json({ error: "Failed to update listing" }, { status: 500 });
    }
}
