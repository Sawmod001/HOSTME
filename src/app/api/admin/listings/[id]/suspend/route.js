import { parseSessionToken, verifyClerkSession, getClerkUser } from "@/lib/auth/getSessionUser";
import { findListingById, updateListing, findUserByClerkId } from "@/lib/db/supabase-queries";
import { logAudit } from "@/lib/db/audit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { toCamelCase, ok, fail, notFound, unauthorised, forbidden, parseId } from "@/lib/db/supabase-utils";

export async function POST(request, { params }) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const p = await params;
    const sessionInfo = parseSessionToken(request);
    if (!sessionInfo?.userId) return unauthorised("No session");
    const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
    if (!isValid) return unauthorised("Invalid session");

    const clerkUser = await getClerkUser(sessionInfo.userId);
    if (!clerkUser) return unauthorised("Clerk user not found");
    if (clerkUser.role !== "admin") return forbidden("Admin role required");

    if (!parseId(p.id)) return fail("Invalid listing ID", 400);

    const listing = await findListingById(p.id);
    if (!listing) return notFound("Listing not found");
    if (listing.status !== "active") return fail("Only active listings can be suspended", 400);

    const updated = await updateListing(p.id, { status: "suspended" });

    const adminUser = await findUserByClerkId(sessionInfo.userId);
    await logAudit({
      actorId: adminUser?.id || null,
      action: "listing.suspended",
      resourceType: "listing",
      resourceId: p.id,
      metadata: { previousStatus: "active", listingTitle: listing.title },
    });

    return ok(toCamelCase(updated));
  } catch (error) {
    console.error("POST /api/admin/listings/suspend error:", error);
    return fail("Failed to suspend listing", 500);
  }
}
