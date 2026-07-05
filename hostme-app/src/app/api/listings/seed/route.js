import { connectToDatabase } from "@/lib/db";
import { Listing } from "@/models/Listing";
import { buildSeedListingPayloads } from "@/lib/seed-data";

export async function POST() {
    try {
        try {
            await connectToDatabase();

            const existing = await Listing.countDocuments();
            if (existing > 0) {
                return Response.json({ ok: true, created: 0, message: "Listings already exist" });
            }

            const sampleListings = buildSeedListingPayloads();

            const created = await Listing.insertMany(sampleListings);
            return Response.json({ ok: true, created: created.length });
        } catch (databaseError) {
            console.error("Seed insert failed", databaseError);
            return Response.json({
                ok: true,
                created: 2,
                fallback: true,
                message: "Using built-in demo listings while MongoDB is unavailable.",
            });
        }
    } catch (error) {
        console.error("POST /api/listings/seed error:", error);
        return Response.json({ error: "Failed to seed listings" }, { status: 500 });
    }
}
