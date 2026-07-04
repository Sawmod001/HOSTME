import { connectToDatabase } from "@/lib/db";
import { Listing } from "@/models/Listing";
import { z } from "zod";
import mongoose from "mongoose";

const RejectSchema = z.object({
    reason: z.string().min(5).max(500),
});

async function checkAdminRole(session) {
    return session && Array.isArray(session.user?.roles) && session.user.roles.includes("admin");
}

export async function POST(request, { params }) {
    try {
        const session = await import("next-auth/react").then((m) => m.getServerSession);
        if (!session || !(await checkAdminRole(session))) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!mongoose.Types.ObjectId.isValid(params.id)) {
            return Response.json({ error: "Invalid listing ID" }, { status: 400 });
        }

        const payload = await request.json();
        const validation = RejectSchema.safeParse(payload);
        if (!validation.success) {
            return Response.json({ error: "Invalid payload", issues: validation.error.issues }, { status: 400 });
        }

        await connectToDatabase();

        const listing = await Listing.findById(params.id);
        if (!listing) {
            return Response.json({ error: "Listing not found" }, { status: 404 });
        }

        if (listing.status !== "pending_review") {
            return Response.json({ error: "Listing is not pending review" }, { status: 400 });
        }

        listing.status = "rejected";
        listing.rejectionReason = validation.data.reason;
        await listing.save();

        return Response.json(listing.toObject());
    } catch (error) {
        console.error(`POST /api/admin/listings/${params.id}/reject error:`, error);
        return Response.json({ error: "Failed to reject listing" }, { status: 500 });
    }
}
