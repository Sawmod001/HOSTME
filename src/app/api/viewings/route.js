import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/helpers";
import { supabase } from "@/lib/db/supabase";
import { logAudit } from "@/lib/db/audit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/viewings
 * List viewings for the current user.
 * - Guests see their own viewings
 * - Hosts see viewings for their listings
 * - Optional ?status=pending filter
 */
export async function GET(request) {
  try {
    const userOrResponse = await requireAuthenticatedUser(request);
    if (userOrResponse instanceof Response) return userOrResponse;
    const user = userOrResponse;

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const listingFilter = searchParams.get("listingId");

    let query = supabase.from("viewings").select(`
      id, listing_id, guest_id, host_id, scheduled_at, duration_minutes,
      status, guest_note, host_note, created_at, updated_at
    `);

    const role = user.role || "guest";
    if (role === "venue_host" || role === "shortlet_host") {
      // Host: viewings for their listings
      if (!user.providerProfile) return NextResponse.json({ ok: true, data: [] });
      const { data: listings } = await supabase
        .from("listings")
        .select("id")
        .eq("provider_profile_id", user.providerProfile.id);
      const listingIds = (listings || []).map((l) => l.id);
      if (listingIds.length === 0) return NextResponse.json({ ok: true, data: [] });
      query = query.in("listing_id", listingIds);
    } else {
      // Guest: their own viewings
      query = query.eq("guest_id", user.id);
    }

    if (statusFilter && ["pending", "confirmed", "completed", "cancelled", "no_show"].includes(statusFilter)) {
      query = query.eq("status", statusFilter);
    }
    if (listingFilter) {
      query = query.eq("listing_id", listingFilter);
    }

    const { data: viewings, error } = await query.order("scheduled_at", { ascending: true });
    if (error) throw error;

    // Enrich with listing and guest/host names
    const enriched = await Promise.all((viewings || []).map(async (v) => {
      const { data: listing } = await supabase
        .from("listings")
        .select("id, title, vertical, location")
        .eq("id", v.listing_id)
        .maybeSingle();

      const { data: guest } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("id", v.guest_id)
        .maybeSingle();

      const { data: host } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("id", v.host_id)
        .maybeSingle();

      return {
        ...v,
        listing: listing || null,
        guestName: guest?.full_name || null,
        hostName: host?.full_name || null,
      };
    }));

    return NextResponse.json({ ok: true, data: enriched });
  } catch (error) {
    console.error("GET /api/viewings error:", error);
    return NextResponse.json({ error: "Failed to fetch viewings" }, { status: 500 });
  }
}

/**
 * POST /api/viewings
 * Guest requests a viewing for a listing.
 *
 * Body:
 *   { listingId, scheduledAt, durationMinutes?, guestNote? }
 */
export async function POST(request) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const rateLimited = checkRateLimit(request, { windowMs: 60_000, max: 5 }, "viewing-create");
    if (rateLimited) return rateLimited;

    const userOrResponse = await requireAuthenticatedUser(request);
    if (userOrResponse instanceof Response) return userOrResponse;
    const user = userOrResponse;

    const body = await request.json();
    const { listingId, scheduledAt, durationMinutes = 30, guestNote } = body;

    if (!listingId || !scheduledAt) {
      return NextResponse.json({ error: "listingId and scheduledAt required" }, { status: 400 });
    }

    // Validate duration
    const dur = Math.max(15, Math.min(120, Number(durationMinutes) || 30));

    // Validate scheduled time is in the future
    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      return NextResponse.json({ error: "scheduledAt must be in the future" }, { status: 400 });
    }

    // Validate guest note length
    if (guestNote && guestNote.length > 500) {
      return NextResponse.json({ error: "guestNote must be 500 characters or fewer" }, { status: 400 });
    }

    // Fetch listing and its host
    const { data: listing } = await supabase
      .from("listings")
      .select("id, provider_profile_id, status, title")
      .eq("id", listingId)
      .maybeSingle();

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (listing.status !== "active") {
      return NextResponse.json({ error: "Listing is not active" }, { status: 409 });
    }

    // Get host user id from provider profile
    const { data: profile } = await supabase
      .from("provider_profiles")
      .select("id, user_id")
      .eq("id", listing.provider_profile_id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: "Listing has no host" }, { status: 404 });
    }

    const hostId = profile.user_id;

    // Cannot book viewing with yourself
    if (hostId === user.id) {
      return NextResponse.json({ error: "Cannot schedule a viewing for your own listing" }, { status: 400 });
    }

    // Check for conflicting viewings (same listing, overlapping time)
    const viewingEnd = new Date(scheduledDate.getTime() + dur * 60 * 1000);
    const { data: conflicts } = await supabase
      .from("viewings")
      .select("id")
      .eq("listing_id", listingId)
      .in("status", ["pending", "confirmed"])
      .lt("scheduled_at", viewingEnd.toISOString())
      .gt("scheduled_at", new Date(scheduledDate.getTime() - 120 * 60 * 1000).toISOString());

    if (conflicts && conflicts.length > 0) {
      return NextResponse.json({ error: "This time slot is not available for a viewing" }, { status: 409 });
    }

    // Create viewing
    const { data: viewing, error: viewingError } = await supabase
      .from("viewings")
      .insert({
        listing_id: listingId,
        guest_id: user.id,
        host_id: hostId,
        scheduled_at: scheduledDate.toISOString(),
        duration_minutes: dur,
        status: "pending",
        guest_note: guestNote || null,
      })
      .select()
      .single();

    if (viewingError) throw viewingError;

    // Create notification for host
    await supabase.from("notifications").insert({
      user_id: hostId,
      type: "viewing_scheduled",
      title: "New Viewing Request",
      body: `A guest requested a viewing for "${listing.title}" on ${scheduledDate.toLocaleDateString()}.`,
      link: `/host/bookings`,
      metadata: { viewing_id: viewing.id, listing_id: listingId },
    });

    await logAudit({
      actorId: user.id,
      action: "viewing.created",
      resourceType: "viewing",
      resourceId: viewing.id,
      metadata: { listing_id: listingId, scheduled_at: scheduledAt, host_id: hostId },
    });

    return NextResponse.json({
      ok: true,
      data: {
        viewingId: viewing.id,
        status: viewing.status,
        scheduledAt: viewing.scheduled_at,
        durationMinutes: dur,
      },
    }, 201);
  } catch (error) {
    console.error("POST /api/viewings error:", error);
    return NextResponse.json({ error: "Failed to create viewing" }, { status: 500 });
  }
}
