import { requireAdmin } from "@/lib/auth/helpers";
import { findListingById, updateListing, findUserByClerkId } from "@/lib/db/supabase-queries";
import { logAudit } from "@/lib/db/audit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { toCamelCase, ok, fail, notFound, parseId } from "@/lib/db/supabase-utils";

export async function POST(request, { params }) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const p = await params;

    const userOrResponse = await requireAdmin(request);
    if (userOrResponse instanceof Response) return userOrResponse;
    const user = userOrResponse;

    if (!parseId(p.id)) return fail("Invalid listing ID", 400);

    const listing = await findListingById(p.id);
    if (!listing) return notFound("Listing not found");
    if (!["submitted", "under_review"].includes(listing.status)) return fail("Listing is not submitted for review", 400);

    const updated = await updateListing(p.id, { status: "active" });
    if (!updated) return fail("Failed to approve listing — update returned empty", 500);

    const adminUser = await findUserByClerkId(user.clerkId);
    await logAudit({
      actorId: adminUser?.id || null,
      action: "listing.approved",
      resourceType: "listing",
      resourceId: p.id,
      metadata: { previousStatus: listing.status, listingTitle: listing.title },
    });

    return ok(toCamelCase(updated));
  } catch (error) {
    console.error("POST /api/admin/listings/[id]/approve error:", error);
    return fail("Failed to approve listing", 500);
  }
}