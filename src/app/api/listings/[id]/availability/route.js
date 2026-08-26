import { NextResponse } from "next/server";
import { findListingById } from "@/lib/db/supabase-queries";
import { supabase } from "@/lib/db/supabase";

/**
 * GET /api/listings/[id]/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
 *
 * For housing listings: checks blocked_dates table for the given range.
 * Returns availability status and list of blocked dates in range.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const listing = await findListingById(id);

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (listing.vertical !== "housing") {
      return NextResponse.json({ error: "Availability check is only for housing listings" }, { status: 400 });
    }

    const url = new URL(request.url);
    const checkIn = url.searchParams.get("checkIn");
    const checkOut = url.searchParams.get("checkOut");

    if (!checkIn || !checkOut) {
      return NextResponse.json({ error: "checkIn and checkOut query params required (YYYY-MM-DD)" }, { status: 400 });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(checkIn) || !dateRegex.test(checkOut)) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 });
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    if (checkOutDate <= checkInDate) {
      return NextResponse.json({ error: "checkOut must be after checkIn" }, { status: 400 });
    }

    const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));

    // Check min/max stay
    const hd = listing.housingDetails || {};
    if (hd.minStayNights && nights < hd.minStayNights) {
      return NextResponse.json({
        available: false,
        reason: `Minimum stay is ${hd.minStayNights} night${hd.minStayNights > 1 ? "s" : ""}`,
        nights,
      });
    }
    if (hd.maxStayNights && nights > hd.maxStayNights) {
      return NextResponse.json({
        available: false,
        reason: `Maximum stay is ${hd.maxStayNights} night${hd.maxStayNights > 1 ? "s" : ""}`,
        nights,
      });
    }

    // Query blocked_dates for the range [checkIn, checkOut)
    const { data: blocked, error } = await supabase
      .from("blocked_dates")
      .select("blocked_date, reason")
      .eq("listing_id", id)
      .gte("blocked_date", checkIn)
      .lt("blocked_date", checkOut)
      .order("blocked_date");

    if (error) throw error;

    const isAvailable = blocked.length === 0;

    return NextResponse.json({
      available: isAvailable,
      nights,
      blockedDates: blocked.map((b) => b.blocked_date),
      reason: isAvailable ? null : `${blocked.length} date(s) in range are blocked`,
    });
  } catch (error) {
    console.error("GET /api/listings/[id]/availability error:", error);
    return NextResponse.json({ error: "Failed to check availability" }, { status: 500 });
  }
}
