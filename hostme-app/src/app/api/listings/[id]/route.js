import { parseSessionToken, verifyClerkSession } from "@/lib/getSessionUser";
import { getUser } from "@/lib/getUser";
import { findListingById, updateListing } from "@/lib/supabase-queries";
import { supabase } from "@/lib/supabase";
import { validateListingUpdate } from "@/lib/validation";
import { toCamelCase, ok, cachedOk, fail, notFound, forbidden, parseId } from "@/lib/supabase-utils";

export async function GET(request, { params }) {
    try {
        const p = await params;
        const isUuid = parseId(p.id);

        try {
            if (!isUuid) return notFound("Listing not found");
            const listing = await findListingById(p.id);
            if (!listing) return notFound("Listing not found");
            return cachedOk(toCamelCase(listing));
        } catch (databaseError) {
            console.error("DB fetch error:", databaseError);
            return fail("Failed to fetch listing", 500);
        }
    } catch (error) {
        console.error("GET /api/listings/[id] error:", error);
        return fail("Failed to fetch listing", 500);
    }
}

export async function PATCH(request, { params }) {
    try {
        const p = await params;
        const sessionInfo = parseSessionToken(request);
        if (!sessionInfo?.userId) return fail("Unauthorized", 401);
        const isValid = await verifyClerkSession(sessionInfo.sessionId);
        if (!isValid) return fail("Unauthorized", 401);

        const user = await getUser(sessionInfo.userId);
        if (!user) return fail("User not found", 404);
        const roles = user.roles || [];

        if (!parseId(p.id)) return fail("Invalid listing ID", 400);

        const listing = await findListingById(p.id);
        if (!listing) return notFound("Listing not found");

        if (listing.host_id !== user.id && !roles.includes("admin")) {
            return forbidden();
        }

        if (listing.status === "pending_review") {
            return fail("Cannot edit listing while under review", 400);
        }

        const payload = await request.json();
        const validation = validateListingUpdate(payload);
        if (!validation.success) {
            const msg = validation.error.issues.map((i) => i.message).join("; ");
            return fail(msg, 400);
        }

        const updates = { ...validation.data };

        let coords;
        if (updates.location?.coordinates?.latitude != null && updates.location?.coordinates?.longitude != null) {
            coords = {
                type: "Point",
                coordinates: [updates.location.coordinates.longitude, updates.location.coordinates.latitude],
            };
        }

        const dbFields = {
            ...(updates.vertical != null && { vertical: updates.vertical }),
            ...(updates.title != null && { title: updates.title }),
            ...(updates.description != null && { description: updates.description }),
            ...(updates.media != null && { media: updates.media }),
            ...(updates.location != null && { location: { ...updates.location, ...(coords && { coordinates: coords }) } }),
            ...(updates.pricing != null && { pricing: updates.pricing }),
            ...(updates.features != null && { features: updates.features }),
            ...(updates.subVertical != null && { sub_vertical: updates.subVertical }),
            ...(updates.bookingType != null && { booking_type: updates.bookingType }),
            ...(updates.operationalRules != null && { operational_rules: updates.operationalRules }),
            ...(updates.addOns != null && { add_ons: updates.addOns }),
        };

        const updated = await updateListing(p.id, dbFields);

        return ok(toCamelCase(updated || listing));
    } catch (error) {
        console.error("PATCH /api/listings/[id] error:", error);
        return fail("Failed to update listing", 500);
    }
}

export async function DELETE(request, { params }) {
    try {
        const p = await params;
        const sessionInfo = parseSessionToken(request);
        if (!sessionInfo?.userId) return fail("Unauthorized", 401);
        const isValid = await verifyClerkSession(sessionInfo.sessionId);
        if (!isValid) return fail("Unauthorized", 401);

        const user = await getUser(sessionInfo.userId);
        if (!user) return fail("User not found", 404);
        const roles = user.roles || [];

        if (!parseId(p.id)) return fail("Invalid listing ID", 400);

        const listing = await findListingById(p.id);
        if (!listing) return notFound("Listing not found");
        if (listing.host_id !== user.id && !roles.includes("admin")) return forbidden();
        if (listing.status === "active") return fail("Deactivate listing before deleting", 400);

        const { error: delError } = await supabase.from("listings").delete().eq("id", p.id);
        if (delError) throw delError;

        return ok({ deleted: true, id: p.id });
    } catch (error) {
        console.error("DELETE /api/listings/[id] error:", error);
        return fail("Failed to delete listing", 500);
    }
}