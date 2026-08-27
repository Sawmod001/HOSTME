import { requireHost } from "@/lib/auth/helpers";
import { supabase } from "@/lib/db/supabase";
import { ok, fail } from "@/lib/db/supabase-utils";
import { logAudit } from "@/lib/db/audit";
import { validateCsrfOrigin } from "@/lib/csrf";

/**
 * GET /api/calendar/subscriptions?listingId=xxx
 * List calendar subscriptions for a listing.
 */
export async function GET(request) {
  try {
    const userOrResponse = await requireHost(request);
    if (userOrResponse instanceof Response) return userOrResponse;
    const user = userOrResponse;

    const { searchParams } = new URL(request.url);
    const listingId = searchParams.get("listingId");

    if (!listingId) return fail("listingId required", 400);

    // Verify ownership
    const { data: listing } = await supabase
      .from("listings")
      .select("id, provider_profile_id")
      .eq("id", listingId)
      .maybeSingle();

    if (!listing) return fail("Listing not found", 404);

    const { data: profile } = await supabase
      .from("provider_profiles")
      .select("id")
      .eq("id", listing.provider_profile_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) return fail("You do not own this listing", 403);

    const { data: subs, error } = await supabase
      .from("calendar_subscriptions")
      .select("id, calendar_name, calendar_url, sync_status, last_synced_at, import_count, created_at")
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return ok({ ok: true, data: subs || [] });
  } catch (error) {
    console.error("GET /api/calendar/subscriptions error:", error);
    return fail("Failed to fetch subscriptions", 500);
  }
}

/**
 * POST /api/calendar/subscriptions
 * Add a calendar subscription for a listing.
 *
 * Body:
 *   { listingId, calendarUrl, calendarName? }
 */
export async function POST(request) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const userOrResponse = await requireHost(request);
    if (userOrResponse instanceof Response) return userOrResponse;
    const user = userOrResponse;

    const body = await request.json();
    const { listingId, calendarUrl, calendarName } = body;

    if (!listingId || !calendarUrl) return fail("listingId and calendarUrl required", 400);

    // Validate URL
    try {
      new URL(calendarUrl);
    } catch {
      return fail("Invalid calendar URL", 400);
    }

    // Verify ownership
    const { data: listing } = await supabase
      .from("listings")
      .select("id, provider_profile_id")
      .eq("id", listingId)
      .maybeSingle();

    if (!listing) return fail("Listing not found", 404);

    const { data: profile } = await supabase
      .from("provider_profiles")
      .select("id")
      .eq("id", listing.provider_profile_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) return fail("You do not own this listing", 403);

    // Check for duplicate URL
    const { data: existing } = await supabase
      .from("calendar_subscriptions")
      .select("id")
      .eq("listing_id", listingId)
      .eq("calendar_url", calendarUrl)
      .maybeSingle();

    if (existing) return fail("This calendar URL is already subscribed", 409);

    const { data: sub, error } = await supabase
      .from("calendar_subscriptions")
      .insert({
        listing_id: listingId,
        host_id: user.id,
        calendar_url: calendarUrl,
        calendar_name: calendarName || null,
        sync_status: "active",
      })
      .select()
      .single();

    if (error) throw error;

    await logAudit({
      actorId: user.id,
      action: "calendar_subscription.created",
      resourceType: "listing",
      resourceId: listingId,
      metadata: { subscription_id: sub.id, calendar_url: calendarUrl },
    });

    return ok({ ok: true, data: { subscriptionId: sub.id } }, 201);
  } catch (error) {
    console.error("POST /api/calendar/subscriptions error:", error);
    return fail("Failed to create subscription", 500);
  }
}

/**
 * DELETE /api/calendar/subscriptions?id=xxx
 * Remove a calendar subscription.
 */
export async function DELETE(request) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const userOrResponse = await requireHost(request);
    if (userOrResponse instanceof Response) return userOrResponse;
    const user = userOrResponse;

    const { searchParams } = new URL(request.url);
    const subId = searchParams.get("id");

    if (!subId) return fail("id required", 400);

    // Verify ownership
    const { data: sub } = await supabase
      .from("calendar_subscriptions")
      .select("id, host_id, listing_id")
      .eq("id", subId)
      .maybeSingle();

    if (!sub) return fail("Subscription not found", 404);
    if (sub.host_id !== user.id) return fail("Not authorized", 403);

    const { error } = await supabase
      .from("calendar_subscriptions")
      .delete()
      .eq("id", subId);

    if (error) throw error;

    await logAudit({
      actorId: user.id,
      action: "calendar_subscription.deleted",
      resourceType: "listing",
      resourceId: sub.listing_id,
      metadata: { subscription_id: subId },
    });

    return ok({ ok: true });
  } catch (error) {
    console.error("DELETE /api/calendar/subscriptions error:", error);
    return fail("Failed to delete subscription", 500);
  }
}
