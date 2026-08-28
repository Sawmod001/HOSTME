import { requireAdmin } from "@/lib/auth/helpers";
import { supabase } from "@/lib/db/supabase";
import { toCamelCase, ok, fail } from "@/lib/db/supabase-utils";
import { validateCsrfOrigin } from "@/lib/csrf";
import { logAudit } from "@/lib/db/audit";
import { notifyListingDecision } from "@/lib/notifications";

/**
 * GET /api/admin/listings/review
 * List listings pending admin review.
 */
export async function GET(request) {
  try {
    const userOrResponse = await requireAdmin(request);
    if (userOrResponse instanceof Response) return userOrResponse;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "submitted";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    const { data: listings, error, count } = await supabase
      .from("listings")
      .select("*, provider_profiles(id, user_id, business_name, display_name)", { count: "exact" })
      .eq("status", status)
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return ok({ data: (listings || []).map(toCamelCase), total: count || 0 });
  } catch (error) {
    console.error("GET /api/admin/listings/review error:", error);
    return fail("Failed to fetch listings for review", 500);
  }
}

/**
 * POST /api/admin/listings/review
 * Approve or reject a listing.
 *
 * Body:
 *   { listingId, decision: 'approved' | 'rejected', reason? }
 */
export async function POST(request) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const userOrResponse = await requireAdmin(request);
    if (userOrResponse instanceof Response) return userOrResponse;
    const user = userOrResponse;

    const payload = await request.json();
    const { listingId, decision, reason } = payload;

    if (!listingId) return fail("Listing ID is required", 400);
    if (!["approved", "rejected"].includes(decision)) return fail("Decision must be 'approved' or 'rejected'", 400);

    const { data: listing, error: fetchError } = await supabase
      .from("listings")
      .select("id, title, status, provider_profile_id")
      .eq("id", listingId)
      .maybeSingle();

    if (fetchError || !listing) return fail("Listing not found", 404);
    if (!["submitted", "under_review"].includes(listing.status)) {
      return fail(`Listing is in "${listing.status}" state and cannot be reviewed`, 400);
    }

    const newStatus = decision === "approved" ? "active" : "rejected";

    const { error: updateError } = await supabase
      .from("listings")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
        ...(decision === "rejected" && reason ? { rejection_reason: reason } : {}),
      })
      .eq("id", listingId);

    if (updateError) throw updateError;

    // Fetch provider user ID for notification
    const { data: profile } = await supabase
      .from("provider_profiles")
      .select("user_id")
      .eq("id", listing.provider_profile_id)
      .maybeSingle();

    if (profile?.user_id) {
      await notifyListingDecision({
        hostId: profile.user_id,
        listingTitle: listing.title,
        listingId,
        decision,
      });
    }

    await logAudit({
      actorId: user.id,
      action: `listing.${decision}`,
      resourceType: "listing",
      resourceId: listingId,
      metadata: { from_status: listing.status, to_status: newStatus, reason: reason || null },
    });

    return ok({ ok: true, data: { listingId, status: newStatus } });
  } catch (error) {
    console.error("POST /api/admin/listings/review error:", error);
    return fail("Failed to review listing", 500);
  }
}
