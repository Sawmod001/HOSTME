import { requireAuthenticatedUser } from "@/lib/auth/helpers";
import { createListing, listListings, countListings, findProviderProfileById } from "@/lib/db/supabase-queries";
import { validateListingCreate, validateListingFilter } from "@/lib/validation";
import { validateCsrfOrigin } from "@/lib/csrf";
import { logAudit } from "@/lib/db/audit";
import { toCamelCase, cachedOk, fail, ok } from "@/lib/db/supabase-utils";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const requestedStatus = searchParams.get("status") || undefined;
        const providerProfileId = searchParams.get("providerProfileId") || undefined;
        const filters = {
            vertical: searchParams.get("vertical") || undefined,
            subVertical: searchParams.get("subVertical") || undefined,
            cityArea: searchParams.get("cityArea") || undefined,
            bookingType: searchParams.get("bookingType") || undefined,
            status: requestedStatus,
            providerProfileId,
            keyword: searchParams.get("keyword") || undefined,
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

        // Resolve caller for access control
        const userOrResponse = await requireAuthenticatedUser(request);
        const caller = userOrResponse instanceof Response ? null : userOrResponse;

        const isAdmin = caller ? caller.role === "admin" : false;

        // Non-public statuses require admin or the provider viewing their own
        const requested = validation.data.status;
        if (requested && requested !== "active" && !isAdmin) {
            // Check if the caller owns this provider profile
            if (providerProfileId && caller?.providerProfile?.id === providerProfileId) {
                // Allow — provider viewing their own non-active listings
            } else {
                return fail("Forbidden", 403);
            }
        }

        // providerProfileId filter: only the provider themselves, admin, or anonymous
        if (providerProfileId && caller?.id && caller.providerProfile?.id !== providerProfileId && !isAdmin) {
            return fail("Forbidden", 403);
        }

        try {
            const items = await listListings({
                status: requested || (providerProfileId && caller?.providerProfile?.id === providerProfileId ? undefined : "active"),
                providerProfileId,
                vertical: validation.data.vertical,
                subVertical: validation.data.subVertical,
                bookingType: validation.data.bookingType,
                cityArea: validation.data.cityArea,
                keyword: validation.data.keyword,
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
        const csrfFail = validateCsrfOrigin(request);
        if (csrfFail) return csrfFail;

        const rateLimited = checkRateLimit(request, { windowMs: 60_000, max: 5 }, "create-listing");
        if (rateLimited) return rateLimited;

        const userOrResponse = await requireAuthenticatedUser(request);
        if (userOrResponse instanceof Response) return userOrResponse;
        const user = userOrResponse;

        // Only providers may create listings
        if (user.role !== "venue_host" && user.role !== "housing_agent") {
            return fail("Only providers can create listings", 403);
        }

        // Must have a provider profile
        if (!user.providerProfile) {
            return fail("Provider profile not found. Please complete your profile first.", 404);
        }

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
                provider_profile_id: user.providerProfile.id,
                vertical: validation.data.vertical,
                sub_vertical: validation.data.subVertical || [],
                booking_type: validation.data.bookingType,
                title: validation.data.title.trim(),
                description: validation.data.description,
                location: loc,
                pricing: validation.data.pricing || {},
                operational_rules: validation.data.operationalRules || {},
                features: validation.data.features || {},
                media: validation.data.media || [],
                add_ons: validation.data.addOns || [],
                status: "draft",
            });

            await logAudit({
                actorId: user.id,
                action: "listing.created",
                resourceType: "listing",
                resourceId: listing.id,
                metadata: { vertical: listing.vertical, title: listing.title, status: "draft" },
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


