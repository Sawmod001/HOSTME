import { parseSessionToken } from "@/lib/auth/getSessionUser";
import { getUser } from "@/lib/auth/getUser";
import { supabase } from "@/lib/db/supabase";
import { ok, fail, notFound, forbidden, parseId } from "@/lib/db/supabase-utils";
import { generateReceipt } from "@/lib/bookings/receipt";

export async function GET(request, { params }) {
  try {
    const p = await params;
    const sessionInfo = parseSessionToken(request);
    if (!sessionInfo?.userId) return fail("Unauthorized", 401);

    const user = await getUser(sessionInfo.userId);
    if (!user) return fail("User not found", 404);
    if (!parseId(p.id)) return fail("Invalid booking ID", 400);

    const { data: booking } = await supabase.from("bookings").select().eq("id", p.id).maybeSingle();
    if (!booking) return notFound("Booking not found");

    // Only confirmed or completed bookings have receipts
    if (!["confirmed", "checked_in", "completed"].includes(booking.status)) {
      return fail("Receipt only available for confirmed bookings", 409);
    }

    const isGuest = booking.guest_id === user.id;
    if (!isGuest) return forbidden();

    const { data: listing } = await supabase.from("listings").select("title").eq("id", booking.listing_id).maybeSingle();

    const receipt = generateReceipt({
      booking,
      listing,
      guest: { name: user.name, email: user.email },
      payment: { ref: booking.gateway_transaction_ref },
    });

    return ok(receipt);
  } catch (error) {
    console.error("GET /api/bookings/[id]/receipt error:", error);
    return fail("Failed to generate receipt", 500);
  }
}
