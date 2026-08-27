import { NextResponse } from "next/server";
import { requireHost } from "@/lib/auth/helpers";
import { findProviderProfileByUserId, findListingById } from "@/lib/db/supabase-queries";
import { supabase } from "@/lib/db/supabase";
import { logAudit } from "@/lib/db/audit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { z } from "zod";

const BlockDatesSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(90),
  reason: z.string().max(200).optional().default("host_blocked"),
});

const UnblockDatesSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(90),
});

async function verifyHostOwnership(request, listingId) {
  const userOrResponse = await requireHost(request);
  if (userOrResponse instanceof Response) {
    const body = await userOrResponse.clone().json().catch(() => ({ error: "Authentication required" }));
    return { error: body.error || "Authentication required", status: userOrResponse.status };
  }
  const user = userOrResponse;

  const profile = await findProviderProfileByUserId(user.id);
  if (!profile) return { error: "Provider profile not found", status: 404 };

  const listing = await findListingById(listingId);
  if (!listing) return { error: "Listing not found", status: 404 };
  if (listing.provider_profile_id !== profile.id) return { error: "Not your listing", status: 403 };
  if (listing.vertical !== "housing") return { error: "Calendar is only for housing listings", status: 400 };

  return { user, profile, listing };
}

/**
 * GET /api/listings/[id]/blocked-dates?month=YYYY-MM
 * Returns all blocked dates for a listing, optionally filtered by month.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const listing = await findListingById(id);
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const month = url.searchParams.get("month"); // YYYY-MM

    let query = supabase
      .from("blocked_dates")
      .select("id, blocked_date, reason, booking_id")
      .eq("listing_id", id)
      .order("blocked_date");

    if (month) {
      const startDate = `${month}-01`;
      const [y, m] = month.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;
      query = query.gte("blocked_date", startDate).lte("blocked_date", endDate);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error("GET /api/listings/[id]/blocked-dates error:", error);
    return NextResponse.json({ error: "Failed to load blocked dates" }, { status: 500 });
  }
}

/**
 * POST /api/listings/[id]/blocked-dates
 * Body: { dates: ["YYYY-MM-DD", ...], reason?: "host_blocked" }
 * Block multiple dates for a housing listing.
 */
export async function POST(request, { params }) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const { id } = await params;
    const auth = await verifyHostOwnership(request, id);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const parsed = BlockDatesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { dates, reason } = parsed.data;

    // Check for already blocked dates
    const { data: existing } = await supabase
      .from("blocked_dates")
      .select("blocked_date")
      .eq("listing_id", id)
      .in("blocked_date", dates);

    const alreadyBlocked = (existing || []).map((e) => e.blocked_date);
    const newDates = dates.filter((d) => !alreadyBlocked.includes(d));

    if (newDates.length === 0) {
      return NextResponse.json({ error: "All selected dates are already blocked", blocked: alreadyBlocked }, { status: 409 });
    }

    // Check for existing bookings on these dates
    const { data: conflictingBookings } = await supabase
      .from("bookings")
      .select("id, event_start, event_end")
      .eq("listing_id", id)
      .in("status", ["pending", "confirmed", "awaiting_payment"]);

    const conflictingDates = new Set();
    if (conflictingBookings) {
      for (const booking of conflictingBookings) {
        const bStart = new Date(booking.event_start);
        const bEnd = new Date(booking.event_end);
        for (const dateStr of newDates) {
          const d = new Date(dateStr);
          if (d >= bStart && d < bEnd) {
            conflictingDates.add(dateStr);
          }
        }
      }
    }

    const safeDates = newDates.filter((d) => !conflictingDates.has(d));
    const blockedByBooking = newDates.filter((d) => conflictingDates.has(d));

    if (safeDates.length === 0) {
      return NextResponse.json({
        error: "All selected dates have existing bookings",
        blockedByBooking: [...conflictingDates],
      }, { status: 409 });
    }

    // Insert blocked dates
    const rows = safeDates.map((d) => ({
      listing_id: id,
      blocked_date: d,
      reason,
    }));

    const { error: insertError } = await supabase.from("blocked_dates").insert(rows);
    if (insertError) throw insertError;

    await logAudit({
      actorId: auth.user.id,
      action: "dates.blocked",
      resourceType: "listing",
      resourceId: id,
      metadata: { dates: safeDates, reason, count: safeDates.length },
    });

    return NextResponse.json({
      blocked: safeDates,
      alreadyBlocked,
      blockedByBooking: blockedByBooking,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/listings/[id]/blocked-dates error:", error);
    return NextResponse.json({ error: "Failed to block dates" }, { status: 500 });
  }
}

/**
 * DELETE /api/listings/[id]/blocked-dates
 * Body: { dates: ["YYYY-MM-DD", ...] }
 * Unblock dates (only host-blocked, not booking-blocked).
 */
export async function DELETE(request, { params }) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const { id } = await params;
    const auth = await verifyHostOwnership(request, id);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const parsed = UnblockDatesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { dates } = parsed.data;

    // Only delete host-blocked dates (not booking-blocked)
    const { data: deleted, error } = await supabase
      .from("blocked_dates")
      .delete()
      .eq("listing_id", id)
      .in("blocked_date", dates)
      .is("booking_id", null)
      .select("blocked_date");

    if (error) throw error;

    await logAudit({
      actorId: auth.user.id,
      action: "dates.unblocked",
      resourceType: "listing",
      resourceId: id,
      metadata: { dates: (deleted || []).map((d) => d.blocked_date) },
    });

    return NextResponse.json({ unblocked: (deleted || []).map((d) => d.blocked_date) });
  } catch (error) {
    console.error("DELETE /api/listings/[id]/blocked-dates error:", error);
    return NextResponse.json({ error: "Failed to unblock dates" }, { status: 500 });
  }
}
