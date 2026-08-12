import { parseSessionToken, verifyClerkSession, getClerkUser } from "@/lib/getSessionUser";
import { findListingById, updateListing } from "@/lib/supabase-queries";
import { z } from "zod";
import { toCamelCase, ok, fail, notFound, unauthorised, forbidden, parseId } from "@/lib/supabase-utils";

const RejectSchema = z.object({
  reason: z.string().min(5).max(500),
});

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

    const payload = await request.json();
    const validation = RejectSchema.safeParse(payload);
    if (!validation.success) {
      return ok({ error: "Invalid payload", issues: validation.error.issues }, 400);
    }

    const listing = await findListingById(p.id);
    if (!listing) return notFound("Listing not found");
    if (listing.status !== "pending_review") return fail("Listing is not pending review", 400);

    const updated = await updateListing(p.id, {
      status: "rejected",
      rejection_reason: validation.data.reason,
    });
    if (!updated) return fail("Failed to reject listing — update returned empty", 500);
    return ok(toCamelCase(updated));
  } catch (error) {
    console.error("POST /api/admin/listings/[id]/reject error:", error);
    return fail("Failed to reject listing", 500);
  }
}