import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/helpers";
import { findListingById } from "@/lib/db/supabase-queries";
import { supabase } from "@/lib/db/supabase";
import { logAudit } from "@/lib/db/audit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { computeCapacityPriceKobo, computeExclusiveFeeKobo, computeCommissionKobo } from "@/lib/bookings/pricing";

/**
 * POST /api/listings/[id]/reserve
 * Unified reservation endpoint for both capacity and exclusive bookings.
 *
 * Body:
 *   { eventStart, eventEnd, headcount, addOns?: [] }
 *
 * Flow:
 *   1. Validate input
 *   2. Check availability (blocked_dates, existing bookings, exclusive locks)
 *   3. Calculate server-side price (price snapshot)
 *   4. Create atomic hold (capacity) or exclusive lock
 *   5. Return hold details + pricing for payment
 */
export async function POST(request, { params }) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const rateLimited = checkRateLimit(request, { windowMs: 60_000, max: 10 }, "reserve");
    if (rateLimited) return rateLimited;

    const { id } = await params;
    const userOrResponse = await requireAuthenticatedUser(request);
    if (userOrResponse instanceof Response) return userOrResponse;
    const user = userOrResponse;

    const listing = await findListingById(id);
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    if (listing.status !== "active") return NextResponse.json({ error: "Listing is not active" }, { status: 409 });

    const body = await request.json();
    const { eventStart, eventEnd, headcount = 1, addOns = [] } = body;

    if (!eventStart || !eventEnd) {
      return NextResponse.json({ error: "eventStart and eventEnd required" }, { status: 400 });
    }

    const parsedHeadcount = Math.max(1, Number(headcount) || 1);
    const startMs = new Date(eventStart).getTime();
    const endMs = new Date(eventEnd).getTime();
    if (endMs <= startMs) {
      return NextResponse.json({ error: "eventEnd must be after eventStart" }, { status: 400 });
    }

    // === 1. CHECK AVAILABILITY ===
    const { data: conflicts } = await supabase
      .rpc("check_time_availability", {
        p_listing_id: id,
        p_event_start: eventStart,
        p_event_end: eventEnd,
      })
      .single();

    if (conflicts && !conflicts.available) {
      return NextResponse.json({
        error: "Time slot is not available",
        reason: conflicts.reason,
      }, { status: 409 });
    }

    // === 2. CALCULATE SERVER-SIDE PRICING ===
    let totalAmountKobo;
    let priceBreakdown;

    if (listing.booking_type === "capacity") {
      totalAmountKobo = computeCapacityPriceKobo({
        listing,
        eventStart,
        eventEnd,
        headcount: parsedHeadcount,
        addOnIds: addOns.map((a) => a.id),
        includeRequired: true,
      });

      priceBreakdown = {
        type: "capacity",
        baseRatePerHour: Number(listing.pricing?.baseRatePerHour) || 0,
        headcount: parsedHeadcount,
        hours: Math.max(1, (endMs - startMs) / (1000 * 60 * 60)),
        totalAmountKobo,
      };
    } else {
      const baseTotal = computeCapacityPriceKobo({
        listing,
        eventStart,
        eventEnd,
        headcount: 1,
        addOnIds: [],
        includeRequired: false,
      });
      const exclusiveFee = computeExclusiveFeeKobo(listing);
      totalAmountKobo = baseTotal + exclusiveFee;

      priceBreakdown = {
        type: "exclusive",
        baseRatePerHour: Number(listing.pricing?.baseRatePerHour) || 0,
        hours: Math.max(1, (endMs - startMs) / (1000 * 60 * 60)),
        baseTotal,
        exclusiveFee,
        totalAmountKobo,
      };
    }

    const commissionKobo = computeCommissionKobo(totalAmountKobo, listing);

    // === 3. CREATE HOLD OR LOCK ===
    const holdMinutes = 10;

    if (listing.booking_type === "capacity") {
      // Find the matching slot
      const { data: slot } = await supabase
        .from("slots")
        .select("id")
        .eq("listing_id", id)
        .lte("event_start", eventStart)
        .gte("event_end", eventEnd)
        .maybeSingle();

      if (!slot) {
        return NextResponse.json({ error: "No matching slot found for this time" }, { status: 409 });
      }

      // Atomic hold creation
      const { data: holdResult } = await supabase
        .rpc("create_hold", {
          p_listing_id: id,
          p_slot_id: slot.id,
          p_guest_id: user.id,
          p_headcount: parsedHeadcount,
          p_expires_in_minutes: holdMinutes,
        })
        .single();

      if (!holdResult?.ok) {
        return NextResponse.json({ error: holdResult?.error || "Failed to create hold" }, { status: 409 });
      }

      await logAudit({
        actorId: user.id,
        action: "hold.created",
        resourceType: "listing",
        resourceId: id,
        metadata: { holdId: holdResult.hold_id, headcount: parsedHeadcount, slotId: slot.id },
      });

      return NextResponse.json({
        ok: true,
        data: {
          holdId: holdResult.hold_id,
          expiresAt: holdResult.expires_at,
          holdMinutes,
          listingId: id,
          bookingType: "capacity",
          eventStart,
          eventEnd,
          headcount: parsedHeadcount,
          totalAmountKobo,
          commissionKobo,
          priceBreakdown,
        },
      }, 201);

    } else {
      // Exclusive: create exclusive lock
      const { data: lock } = await supabase
        .from("exclusive_locks")
        .insert({
          listing_id: id,
          event_start: eventStart,
          event_end: eventEnd,
          status: "open",
        })
        .select()
        .single();

      await logAudit({
        actorId: user.id,
        action: "exclusive_lock.created",
        resourceType: "listing",
        resourceId: id,
        metadata: { lockId: lock.id, eventStart, eventEnd },
      });

      return NextResponse.json({
        ok: true,
        data: {
          lockId: lock.id,
          expiresAt: new Date(Date.now() + holdMinutes * 60 * 1000).toISOString(),
          holdMinutes,
          listingId: id,
          bookingType: "exclusive",
          eventStart,
          eventEnd,
          headcount: parsedHeadcount,
          totalAmountKobo,
          commissionKobo,
          priceBreakdown,
        },
      }, 201);
    }
  } catch (error) {
    console.error("POST /api/listings/[id]/reserve error:", error);
    return NextResponse.json({ error: "Failed to reserve slot" }, { status: 500 });
  }
}
