import { requireAuthenticatedUser } from "@/lib/auth/helpers";
import { supabase } from "@/lib/db/supabase";
import { toCamelCase, ok, fail, notFound } from "@/lib/db/supabase-utils";
import { logAudit } from "@/lib/db/audit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { computeHousingPriceKobo, validateStayDuration } from "@/lib/pricing/housing";

/**
 * POST /api/housing/book
 * Create a housing booking (short-term stay).
 *
 * Body:
 *   { listingId, checkIn, checkOut, guests, addOns?: [] }
 *
 * Flow:
 *   1. Validate input + stay duration
 *   2. Check date availability (no blocked_dates, no overlapping bookings)
 *   3. Calculate server-side pricing (price snapshot)
 *   4. Create booking with pricing snapshot + terms snapshot
 *   5. Block dates
 *   6. Return booking for payment
 */
export async function POST(request) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const rateLimited = checkRateLimit(request, { windowMs: 60_000, max: 5 }, "housing-book");
    if (rateLimited) return rateLimited;

    const userOrResponse = await requireAuthenticatedUser(request);
    if (userOrResponse instanceof Response) return userOrResponse;
    const user = userOrResponse;

    const body = await request.json();
    const { listingId, checkIn, checkOut, guests = 1, addOns = [] } = body;

    if (!listingId || !checkIn || !checkOut) {
      return fail("listingId, checkIn, and checkOut required", 400);
    }

    const listing = await supabase.from("listings").select().eq("id", listingId).maybeSingle();
    if (!listing.data) return notFound("Listing not found");
    if (listing.data.status !== "active") return fail("Listing is not active", 409);
    if (listing.data.vertical !== "housing") return fail("This endpoint is for housing listings only", 400);

    // === 1. VALIDATE STAY DURATION ===
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));

    if (nights < 1) return fail("Minimum stay is 1 night", 400);

    const rules = listing.data.operational_rules || {};
    const durationCheck = validateStayDuration({
      nights,
      minStayNights: rules.minStayNights || 1,
      maxStayNights: rules.maxStayNights,
    });
    if (!durationCheck.valid) return fail(durationCheck.error, 400);

    // === 2. CHECK AVAILABILITY (tenancy-aware) ===
    const { data: avail } = await supabase
      .rpc("check_housing_availability_with_tenancy", {
        p_listing_id: listingId,
        p_check_in: checkIn,
        p_check_out: checkOut,
      })
      .single();

    if (avail && !avail.available) {
      return fail(avail.detail || "Some dates are not available", 409);
    }

    // Check for overlapping bookings
    const { data: conflicts } = await supabase
      .from("bookings")
      .select("id")
      .eq("listing_id", listingId)
      .in("status", ["confirmed", "awaiting_payment"])
      .lt("event_start", checkOut)
      .gt("event_end", checkIn);

    if (conflicts && conflicts.length > 0) {
      return fail("Some dates have existing bookings", 409);
    }

    // === 3. SERVER-SIDE PRICING ===
    // Check for tenancy period rate override
    const { data: tenancyPeriod } = await supabase
      .from("tenancy_periods")
      .select("nightly_rate_override_kobo")
      .eq("listing_id", listingId)
      .eq("status", "available")
      .lte("start_date", checkIn)
      .gte("end_date", checkOut)
      .maybeSingle();

    const pricing = listing.data.pricing || {};
    const effectiveNightlyRate = tenancyPeriod?.nightly_rate_override_kobo
      || Number(pricing.nightlyRate) || 0;

    const priceResult = computeHousingPriceKobo({
      nightlyRateKobo: effectiveNightlyRate,
      weeklyRateKobo: Number(pricing.weeklyRate) || 0,
      cleaningFeeKobo: Number(pricing.cleaningFee) || 0,
      nights,
    });

    const totalAmountKobo = priceResult.total;
    const commissionKobo = Math.round(totalAmountKobo * 0.05);

    // === 4. CREATE BOOKING ===
    const pricingSnapshot = {
      nightlyRate: effectiveNightlyRate,
      originalNightlyRate: Number(pricing.nightlyRate) || 0,
      weeklyRate: Number(pricing.weeklyRate) || 0,
      cleaningFee: Number(pricing.cleaningFee) || 0,
      nights,
      tenancyOverride: !!tenancyPeriod?.nightly_rate_override_kobo,
      ...priceResult,
    };

    const termsSnapshot = {
      checkIn,
      checkOut,
      guests,
      minStayNights: rules.minStayNights || 1,
      maxStayNights: rules.maxStayNights,
      cancellationPolicy: rules.cancellationPolicy || "moderate",
      checkInTime: rules.checkInTime || "14:00",
      checkOutTime: rules.checkOutTime || "11:00",
    };

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        listing_id: listingId,
        guest_id: user.id,
        booking_type: "housing",
        event_start: checkIn,
        event_end: checkOut,
        headcount: guests,
        status: "awaiting_payment",
        total_amount_kobo: totalAmountKobo,
        commission_kobo: commissionKobo,
        pricing_snapshot: pricingSnapshot,
        terms_snapshot: termsSnapshot,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (bookingError) throw bookingError;

    // === 5. BLOCK DATES ===
    const blockedDates = [];
    const d = new Date(checkIn);
    while (d < checkOutDate) {
      blockedDates.push({
        listing_id: listingId,
        blocked_date: d.toISOString().slice(0, 10),
        reason: "booking_held",
        booking_id: booking.id,
      });
      d.setDate(d.getDate() + 1);
    }

    if (blockedDates.length > 0) {
      await supabase.from("blocked_dates").insert(blockedDates);
    }

    await logAudit({
      actorId: user.id,
      action: "booking.created",
      resourceType: "booking",
      resourceId: booking.id,
      metadata: {
        listing_id: listingId,
        type: "housing",
        check_in: checkIn,
        check_out: checkOut,
        nights,
        total_amount_kobo: totalAmountKobo,
      },
    });

    return ok({
      ok: true,
      data: {
        bookingId: booking.id,
        status: booking.status,
        checkIn,
        checkOut,
        nights,
        guests,
        totalAmountKobo,
        commissionKobo,
        priceBreakdown: priceResult,
      },
    }, 201);
  } catch (error) {
    console.error("POST /api/housing/book error:", error);
    return fail("Failed to create housing booking", 500);
  }
}
