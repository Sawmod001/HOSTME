import { parseSessionToken, verifyClerkSession } from "@/lib/getSessionUser";
import { getMongoUser } from "@/lib/getMongoUser";
import { findListingById, updateListing } from "@/lib/supabase-queries";
import { toCamelCase, ok, fail, notFound, forbidden, parseId } from "@/lib/supabase-utils";

export async function POST(request, { params }) {
    try {
        const p = await params;
        const sessionInfo = parseSessionToken(request);
        if (!sessionInfo?.userId) return fail("Unauthorized", 401);
        const isValid = await verifyClerkSession(sessionInfo.sessionId);
        if (!isValid) return fail("Unauthorized", 401);

        const user = await getMongoUser(sessionInfo.userId);
        if (!user) return fail("User not found", 404);

        if (!parseId(p.id)) return fail("Invalid listing ID", 400);

        const listing = await findListingById(p.id);
        if (!listing) return notFound("Listing not found");
        if (listing.host_id !== user.id) return forbidden();
        if (listing.status !== "draft") return fail("Listing is not in draft status", 400);

        const updated = await updateListing(p.id, { status: "pending_review" });
        return ok(toCamelCase(updated));
    } catch (error) {
        console.error("POST /api/listings/[id]/submit-review error:", error);
        return fail("Failed to submit for review", 500);
    }
}