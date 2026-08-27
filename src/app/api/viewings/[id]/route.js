import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/helpers";
import { supabase } from "@/lib/db/supabase";
import { logAudit } from "@/lib/db/audit";
import { validateCsrfOrigin } from "@/lib/csrf";

/**
 * PATCH /api/viewings/[id]
 * Update viewing status (confirm, complete, cancel, no_show).
 *
 * Body:
 *   { status, hostNote? }
 *
 * Rules:
 * - Host can: confirm, complete, cancel, mark no_show
 * - Guest can: cancel
 * - Status transitions: pending→confirmed, pending→cancelled,
 *   confirmed→completed, confirmed→cancelled, confirmed→no_show
 */
export async function PATCH(request, { params }) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const userOrResponse = await requireAuthenticatedUser(request);
    if (userOrResponse instanceof Response) return userOrResponse;
    const user = userOrResponse;

    const { id } = await params;
    const body = await request.json();
    const { status, hostNote } = body;

    const validStatuses = ["confirmed", "completed", "cancelled", "no_show"];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
    }

    // Fetch the viewing
    const { data: viewing } = await supabase
      .from("viewings")
      .select("id, listing_id, guest_id, host_id, status, scheduled_at, duration_minutes")
      .eq("id", id)
      .maybeSingle();

    if (!viewing) {
      return NextResponse.json({ error: "Viewing not found" }, { status: 404 });
    }

    const isHost = viewing.host_id === user.id;
    const isGuest = viewing.guest_id === user.id;

    if (!isHost && !isGuest) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Validate status transitions
    const validTransitions = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["completed", "cancelled", "no_show"],
    };

    const allowed = validTransitions[viewing.status] || [];
    if (!allowed.includes(status)) {
      return NextResponse.json({
        error: `Cannot transition from "${viewing.status}" to "${status}"`,
      }, { status: 400 });
    }

    // Guest can only cancel
    if (isGuest && status !== "cancelled") {
      return NextResponse.json({ error: "Guests can only cancel viewings" }, { status: 403 });
    }

    // Host can confirm, complete, cancel, no_show
    if (isHost && ["confirmed", "completed", "cancelled", "no_show"].includes(status)) {
      // ok
    }

    // Update viewing
    const updateData = { status };
    if (hostNote && isHost) updateData.host_note = hostNote;

    const { error: updateError } = await supabase
      .from("viewings")
      .update(updateData)
      .eq("id", id);

    if (updateError) throw updateError;

    // Send notification to the other party
    const notifyUserId = isHost ? viewing.guest_id : viewing.host_id;
    const actorName = user.full_name || "Someone";
    const listing = await supabase
      .from("listings")
      .select("title")
      .eq("id", viewing.listing_id)
      .maybeSingle();

    const listingTitle = listing?.data?.title || "a listing";
    let notifType, notifTitle, notifBody;

    switch (status) {
      case "confirmed":
        notifType = "viewing_confirmed";
        notifTitle = "Viewing Confirmed";
        notifBody = `${actorName} confirmed the viewing for "${listingTitle}".`;
        break;
      case "completed":
        notifType = "viewing_completed";
        notifTitle = "Viewing Completed";
        notifBody = `The viewing for "${listingTitle}" has been marked as completed.`;
        break;
      case "cancelled":
        notifType = "viewing_cancelled";
        notifTitle = "Viewing Cancelled";
        notifBody = `${actorName} cancelled the viewing for "${listingTitle}".`;
        break;
      case "no_show":
        notifType = "viewing_no_show";
        notifTitle = "Viewing No-Show";
        notifBody = `The guest did not show up for the viewing at "${listingTitle}".`;
        break;
    }

    if (notifType) {
      await supabase.from("notifications").insert({
        user_id: notifyUserId,
        type: notifType,
        title: notifTitle,
        body: notifBody,
        link: isHost ? "/host/bookings" : "/dashboard",
        metadata: { viewing_id: id, listing_id: viewing.listing_id },
      });
    }

    await logAudit({
      actorId: user.id,
      action: `viewing.${status}`,
      resourceType: "viewing",
      resourceId: id,
      metadata: { from_status: viewing.status, to_status: status, host_note: hostNote },
    });

    return NextResponse.json({ ok: true, data: { id, status } });
  } catch (error) {
    console.error("PATCH /api/viewings/[id] error:", error);
    return NextResponse.json({ error: "Failed to update viewing" }, { status: 500 });
  }
}
