import { parseSessionToken, verifyClerkSession } from "@/lib/getSessionUser";
import { getUser } from "@/lib/getUser";
import { createListing, listListings, countListings } from "@/lib/supabase-queries";
import { validateListingCreate, validateListingFilter } from "@/lib/validation";
import { toCamelCase, cachedOk, fail } from "@/lib/supabase-utils";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const filters = {
            vertical: searchParams.get("vertical") || undefined,
            subVertical: searchParams.get("subVertical") || undefined,
            cityArea: searchParams.get("cityArea") || undefined,
            bookingType: searchParams.get("bookingType") || undefined,
            status: searchParams.get("status") || undefined,
            hostId: searchParams.get("hostId") || undefined,
            lat: searchParams.get("lat") ? parseFloat(searchParams.get("lat")) : undefined,
            lng: searchParams.get("lng") ? parseFloat(searchParams.get("lng")) : undefined,
            radiusKm: searchParams.get("radiusKm") ? parseFloat(searchParams.get("radiusKm")) : 50,
            limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")) : 20,
            cursor: searchParams.get("cursor") || undefined,
        };

        const validation = validateListingFilter(filters);
        if (!validation.success) {
            return fail("Invalid filters", 400);
        }

        try {
            const items = await listListings({
                status: validation.data.status || (validation.data.hostId ? undefined : "active"),
                hostId: validation.data.hostId,
                vertical: validation.data.vertical,
                subVertical: validation.data.subVertical,
                bookingType: validation.data.bookingType,
                cityArea: validation.data.cityArea,
                cursor: validation.data.cursor,
                limit: validation.data.limit + 1,
            });

            const hasMore = items.length > validation.data.limit;
            const page = items.slice(0, validation.data.limit);
            const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].created_at : null;

            return cachedOk({
                data: page.map(toCamelCase),
                pagination: { nextCursor, hasMore },
            });
        } catch (databaseError) {
            console.error("DB fetch error:", databaseError);
            return fail("Failed to fetch listings", 500);
        }
    } catch (error) {
        console.error("GET /api/listings error:", error);
        return fail("Failed to fetch listings", 500);
    }
}

export async function POST(request) {
    try {
        const sessionInfo = parseSessionToken(request);
        if (!sessionInfo?.userId) return fail("Unauthorized", 401);
        const isValid = await verifyClerkSession(sessionInfo.sessionId);
        if (!isValid) return fail("Unauthorized", 401);

        const user = await getUser(sessionInfo.userId);
        if (!user) return fail("User not found", 404);

        const payload = await request.json();
        const validation = validateListingCreate(payload);
        if (!validation.success) {
            return fail(validation.error.issues.map((i) => i.message || i.path?.join(".") + " " + i.message).join("; "), 400);
        }

        try {
            const loc = { ...validation.data.location };
            if (loc.coordinates?.latitude != null && loc.coordinates?.longitude != null) {
                loc.coordinates = { type: "Point", coordinates: [loc.coordinates.longitude, loc.coordinates.latitude] };
            } else {
                loc.coordinates = { type: "Point", coordinates: [0, 0] };
            }

            const listing = await createListing({
                host_id: user.id,
                vertical: validation.data.vertical,
                sub_vertical: validation.data.subVertical || [],
                booking_type: validation.data.bookingType,
                title: validation.data.title,
                description: validation.data.description,
                location: loc,
                pricing: validation.data.pricing || {},
                operational_rules: validation.data.operationalRules || {},
                features: validation.data.features || {},
                media: validation.data.media || [],
                add_ons: validation.data.addOns || [],
                status: "pending_review",
            });

            return ok(toCamelCase(listing), 201);
        } catch (databaseError) {
            console.error("POST /api/listings DB error:", databaseError);
            const msg = databaseError?.message || "";
            const details = databaseError?.code ? `[${databaseError.code}] ` : "";
            return fail(`Database error: ${details}${msg || "unknown"}`, 503);
        }
    } catch (error) {
        console.error("POST /api/listings error:", error);
        return fail("Failed to create listing", 500);
    }
}