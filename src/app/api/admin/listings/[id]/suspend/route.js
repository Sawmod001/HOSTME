import { requireAdmin } from "@/lib/auth/helpers";
import { findListingById, updateListing } from "@/lib/db/supabase-queries";
import { logAudit } from "@/lib/db/audit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { toCamelCase, ok, fail, notFound, parseId } from "@/lib/db/supabase-utils";

export async function POST(request, { params }) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const adminOrResponse = await requireAdmin(request);
    if (adminOrResponse instanceof Response) return adminOrResponse;
    const admin = adminOrResponse;

    const p = await params;
    if (!parseId(p.id)) return fail("Invalid listing ID", 400);

    const listing = await findListingById(p.id);
    if (!listing) return notFound("Listing not found");
    if (listing.status !== "active") return fail("Only active listings can be suspended", 400);

    const updated = await updateListing(p.id, { status: "suspended" });

    await logAudit({
      actorId: admin.id,
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
