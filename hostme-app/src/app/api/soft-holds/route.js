import { supabase } from "@/lib/supabase";
import { toCamelCase, ok, fail, notFound } from "@/lib/supabase-utils";

function getUserIdFromCookie(request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").filter(Boolean).map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k.trim(), v.join("=")];
    })
  );
  return cookies["__session"] || null;
}

export async function POST(request) {
    try {
        const sessionToken = getUserIdFromCookie(request);
        if (!sessionToken) return fail("Authentication required", 401);

        const clerkRes = await fetch("https://api.clerk.com/v1/sessions/" + sessionToken, {
          headers: { Authorization: "Bearer " + process.env.CLERK_SECRET_KEY },
        });
        if (!clerkRes.ok) return fail("Authentication required", 401);
        const sessionData = await clerkRes.json();
        const clerkId = sessionData.user_id;

        const { data: user } = await supabase.from("users").select("id").eq("clerk_id", clerkId).maybeSingle();
        if (!user) return fail("User not found", 404);

        const payload = await request.json();
        const { listingId, slotId, headcount, guestName, guestEmail, guestPhone } = payload;
        if (!listingId || !slotId || !headcount) {
            return fail("Missing required booking details", 400);
        }

        const { data: listing } = await supabase.from("listings").select().eq("id", listingId).maybeSingle();
        if (!listing) return notFound("Listing not found");
        if (listing.booking_type !== "capacity") return fail("Listing is not capacity-based", 400);

        const { data: updatedSlot, error } = await supabase
            .rpc("reserve_capacity_slot", {
                p_slot_id: slotId,
                p_listing_id: listingId,
                p_headcount: headcount,
            })
            .maybeSingle();

        if (error || !updatedSlot) {
            return fail("Slot is full or unavailable", 409);
        }

        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        const { data: softHold } = await supabase
            .from("soft_holds")
            .insert({
                slot_id: slotId,
                headcount,
                guest_id: user.id,
                expires_at: expiresAt.toISOString(),
                booking_id: null,
            })
            .select()
            .single();

        return ok({
            ok: true,
            data: {
                softHoldId: softHold.id,
                slotId,
                listingId,
                headcount,
                expiresAt: softHold.expires_at,
                totalAmountKobo: listing.pricing?.baseRatePerHour ? listing.pricing.baseRatePerHour * headcount : 0,
                guest: { name: guestName || "Guest", email: guestEmail || null, phone: guestPhone || null },
            },
        }, 201);
    } catch (error) {
        console.error("POST /api/soft-holds error:", error);
        return fail("Failed to create soft hold", 500);
    }
}
