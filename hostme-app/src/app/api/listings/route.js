import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { Listing } from "@/models/Listing";
import { validateListingCreate, validateListingFilter } from "@/lib/validation";
import { buildListingQuery } from "@/lib/geo";
import { getDemoListings, seedDemoListings } from "@/lib/demo-data";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const filters = {
            vertical: searchParams.get("vertical") || undefined,
            cityArea: searchParams.get("cityArea") || undefined,
            bookingType: searchParams.get("bookingType") || undefined,
            lat: searchParams.get("lat") ? parseFloat(searchParams.get("lat")) : undefined,
            lng: searchParams.get("lng") ? parseFloat(searchParams.get("lng")) : undefined,
            radiusKm: searchParams.get("radiusKm") ? parseFloat(searchParams.get("radiusKm")) : 50,
            limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")) : 20,
            cursor: searchParams.get("cursor") || undefined,
        };

        const validation = validateListingFilter(filters);
        if (!validation.success) {
            return Response.json({ error: "Invalid filters", issues: validation.error.issues }, { status: 400 });
        }

        try {
            await connectToDatabase();

            const query = buildListingQuery(validation.data);
            if (validation.data.cursor) {
                query._id = { $gt: validation.data.cursor };
            }

            const listings = await Listing.find(query)
                .limit(validation.data.limit + 1)
                .lean();

            const hasMore = listings.length > validation.data.limit;
            const items = listings.slice(0, validation.data.limit);
            const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]._id : null;

            return Response.json({
                data: items,
                pagination: { nextCursor, hasMore },
            });
        } catch (databaseError) {
            const demoResult = getDemoListings({
                vertical: validation.data.vertical,
                cityArea: validation.data.cityArea,
                bookingType: validation.data.bookingType,
                limit: validation.data.limit,
                cursor: validation.data.cursor,
            });

            return Response.json(demoResult);
        }
    } catch (error) {
        console.error("GET /api/listings error:", error);
        return Response.json({ error: "Failed to fetch listings" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const payload = await request.json();
        const validation = validateListingCreate(payload);
        if (!validation.success) {
            return Response.json({ error: "Invalid payload", issues: validation.error.issues }, { status: 400 });
        }

        try {
            await connectToDatabase();

            const listing = new Listing({
                hostId: session.user.id,
                ...validation.data,
                location: {
                    ...validation.data.location,
                    coordinates: [validation.data.location.coordinates.longitude, validation.data.location.coordinates.latitude],
                },
                status: "draft",
            });

            await listing.save();

            return Response.json(listing.toObject(), { status: 201 });
        } catch (databaseError) {
            return Response.json({ error: "Database unavailable" }, { status: 503 });
        }
    } catch (error) {
        console.error("POST /api/listings error:", error);
        return Response.json({ error: "Failed to create listing" }, { status: 500 });
    }
}
