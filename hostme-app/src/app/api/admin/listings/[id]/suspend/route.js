import { parseSessionToken, verifyClerkSession, getClerkUser } from "@/lib/getSessionUser";
import { findListingById, updateListing } from "@/lib/supabase-queries";
import { toCamelCase, ok, fail, notFound, unauthorised, forbidden, parseId } from "@/lib/supabase-utils";

export async function POST(request, { params }) {
  try {
    const p = await params;
    const sessionInfo = parseSessionToken(request);
    if (!sessionInfo?.userId) return unauthorised("No session");
    const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
    if (!isValid) return unauthorised("Invalid session");

    const clerkUser = await getClerkUser(sessionInfo.userId);
    if (!clerkUser) return unauthorised("Clerk user not found");
    if (!clerkUser.roles?.includes("admin")) return forbidden("Admin role required");

    if (!parseId(p.id)) return fail("Invalid listing ID", 400);

    const listing = await findListingById(p.id);
    if (!listing) return notFound("Listing not found");
    if (listing.status !== "active") return fail("Only active listings can be suspended", 400);

    const updated = await updateListing(p.id, { status: "suspended" });
    return ok(toCamelCase(updated));
  } catch (error) {
    console.error("POST /api/admin/listings/suspend error:", error);
    return fail("Failed to suspend listing", 500);
  }
}
