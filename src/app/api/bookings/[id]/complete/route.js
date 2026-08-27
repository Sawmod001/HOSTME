import { requireHost } from "@/lib/auth/helpers";
import { supabase } from "@/lib/db/supabase";
import { toCamelCase, ok, fail, notFound, forbidden, parseId } from "@/lib/db/supabase-utils";
import { logAudit } from "@/lib/db/audit";

export async function POST(request, { params }) {
  try {
    const p = await params;
    const userOrResponse = await requireHost(request);
    if (userOrResponse instanceof Response) return userOrResponse;
    const user = userOrResponse;
    if (!parseId(p.id)) return fail("Invalid booking ID", 400);

    const { data: booking } = await supabase.from("bookings").select().eq("id", p.id).maybeSingle();
    if (!booking) return notFound("Booking not found");

    const { data: listing } = await supabase.from("listings").select("provider_profile_id").eq("id", booking.listing_id).maybeSingle();
    if (!listing) return notFound("Listing not found");
    if (user.providerProfile?.id !== listing.provider_profile_id) return forbidden();

    if (booking.status !== "confirmed") return fail("Only confirmed bookings can be marked completed", 400);

    const { data: updated } = await supabase
      .from("bookings")
      .update({ status: "completed" })
      .eq("id", p.id)
      .select()
      .maybeSingle();

    await logAudit({
      actorId: user.id,
      action: "booking.completed",
      resourceType: "booking",
      resourceId: p.id,
      metadata: { guest_id: booking.guest_id, listing_id: booking.listing_id },
    });

    return ok(toCamelCase(updated));
  } catch (error) {
    console.error("POST /api/bookings/[id]/complete error:", error);
    return fail("Failed to complete booking", 500);
  }
}