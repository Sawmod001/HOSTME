export function hoursBetween(start, end) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, ms / (1000 * 60 * 60));
}

function addonPriceKobo(addon) {
  return Number(addon.priceInKobo ?? addon.price_in_kobo ?? addon.priceKobo ?? 0) || 0;
}

/**
 * Compute multi-guest discount.
 * Starting from 2 guests, apply a percentage discount that increases with group size.
 * Tiers defined in listing.pricing.multiGuestDiscountPercent.
 */
function computeMultiGuestDiscount(headcount, listingPricing) {
  if (headcount < 2) return 0;
  const tiers = listingPricing?.multiGuestDiscountTiers || [];
  // tiers: [{ minGuests: 2, percent: 5 }, { minGuests: 5, percent: 10 }, ...]
  let discountPercent = 0;
  for (const tier of tiers) {
    if (headcount >= tier.minGuests) {
      discountPercent = tier.percent;
    }
  }
  return discountPercent;
}

/**
 * Compute venue-spend entitlement discount.
 * If the guest has spent >= venue_spend_threshold_kobo in the last 30 days,
 * apply venue_spend_discount_percent.
 */
function computeVenueSpendDiscount(totalAmountKobo, listingPricing) {
  const threshold = listingPricing?.venueSpendThresholdKobo || 0;
  const discountPercent = listingPricing?.venueSpendDiscountPercent || 0;
  if (threshold > 0 && totalAmountKobo >= threshold && discountPercent > 0) {
    return discountPercent;
  }
  return 0;
}

/**
 * Compute hourly discount based on duration tiers.
 * Tiers: [{ minHours: 4, percent: 5 }, { minHours: 8, percent: 10 }]
 */
function computeHourlyDiscount(hours, listingPricing) {
  const tiers = listingPricing?.hourlyDiscountTiers || [];
  let discountPercent = 0;
  for (const tier of tiers) {
    if (hours >= tier.minHours) {
      discountPercent = tier.percent;
    }
  }
  return discountPercent;
}

/**
 * Compute platform commission. Configurable per listing.
 * Default: 5% of total.
 */
function computeCommission(totalAmountKobo, listingPricing) {
  const commissionRate = listingPricing?.commissionRatePercent ?? 5;
  return Math.round(totalAmountKobo * commissionRate / 100);
}

/**
 * Compute capacity-based pricing for venue bookings.
 *
 * Formula:
 *   base = baseRatePerHour × headcount × hours
 *   + add-ons (per-unit, matched by ID)
 *   - multi-guest discount (% off base)
 *   - hourly discount (% off base for long durations)
 *   - venue-spend entitlement discount (% off base)
 *   = totalAmountKobo
 *
 * Commission is separate: commissionRate% of totalAmountKobo
 */
export function computeCapacityPriceKobo({ listing, eventStart, eventEnd, headcount, addOnIds = [], includeRequired = false }) {
  const baseRatePerHour = Number(listing?.pricing?.baseRatePerHour) || 0;
  const people = Math.max(1, Number(headcount) || 0);
  const hours = hoursBetween(eventStart, eventEnd);
  const baseKobo = baseRatePerHour * people * hours;

  // Add-ons
  const menu = new Map((listing?.add_ons || []).map((a) => [a.id, addonPriceKobo(a)]));
  let addOnsKobo = [...new Set(addOnIds || [])].reduce((sum, id) => sum + (menu.get(id) || 0), 0);
  if (includeRequired) {
    addOnsKobo += (listing?.add_ons || []).filter((a) => a.isRequired).reduce((sum, a) => sum + addonPriceKobo(a), 0);
  }

  let subtotal = baseKobo + addOnsKobo;

  // Multi-guest discount (applied to base only)
  const multiGuestDiscountPercent = computeMultiGuestDiscount(people, listing?.pricing);
  if (multiGuestDiscountPercent > 0) {
    const discount = Math.round(baseKobo * multiGuestDiscountPercent / 100);
    subtotal -= discount;
  }

  // Hourly discount (applied to base only)
  const hourlyDiscountPercent = computeHourlyDiscount(hours, listing?.pricing);
  if (hourlyDiscountPercent > 0) {
    const discount = Math.round(baseKobo * hourlyDiscountPercent / 100);
    subtotal -= discount;
  }

  // Venue-spend entitlement (applied to subtotal)
  const venueSpendDiscountPercent = computeVenueSpendDiscount(subtotal, listing?.pricing);
  if (venueSpendDiscountPercent > 0) {
    const discount = Math.round(subtotal * venueSpendDiscountPercent / 100);
    subtotal -= discount;
  }

  return Math.max(0, Math.round(subtotal));
}

/**
 * Compute exclusive flat fee for exclusive bookings.
 * Added on top of the base capacity price.
 */
export function computeExclusiveFeeKobo(listing) {
  return Number(listing?.pricing?.exclusiveFlatFeeKobo) || 0;
}

/**
 * Compute total commission for a booking.
 * Uses configurable rate per listing.
 */
export function computeCommissionKobo(totalAmountKobo, listing) {
  return computeCommission(totalAmountKobo, listing?.pricing);
}

/**
 * Compute Paystack transaction fee.
 * Local cards: 1.5% capped at ₦2,000
 * International: 3.9% + ₦100
 * By default, the platform absorbs the fee.
 */
export function computePaystackFeeKobo(amountKobo, isInternational = false) {
  if (amountKobo <= 0) return 0;
  const amountNaira = amountKobo / 100;

  if (isInternational) {
    const feeNaira = amountNaira * 0.039 + 100;
    return Math.round(Math.min(feeNaira, 5000) * 100);
  }

  const feeNaira = amountNaira * 0.015;
  const cappedNaira = Math.min(feeNaira, 2000);
  return Math.round(cappedNaira * 100);
}

/**
 * Compute full pricing breakdown for a booking.
 * Returns all components needed for display and snapshot.
 */
export function computePricingBreakdown({ listing, eventStart, eventEnd, headcount, addOnIds = [], includeRequired = false }) {
  const baseRatePerHour = Number(listing?.pricing?.baseRatePerHour) || 0;
  const people = Math.max(1, Number(headcount) || 0);
  const hours = hoursBetween(eventStart, eventEnd);
  const baseKobo = baseRatePerHour * people * hours;

  const menu = new Map((listing?.add_ons || []).map((a) => [a.id, addonPriceKobo(a)]));
  let selectedAddOnsKobo = [...new Set(addOnIds || [])].reduce((sum, id) => sum + (menu.get(id) || 0), 0);
  if (includeRequired) {
    selectedAddOnsKobo += (listing?.add_ons || []).filter((a) => a.isRequired).reduce((sum, a) => sum + addonPriceKobo(a), 0);
  }

  let subtotal = baseKobo + selectedAddOnsKobo;

  const multiGuestDiscountPercent = computeMultiGuestDiscount(people, listing?.pricing);
  const multiGuestDiscountKobo = multiGuestDiscountPercent > 0 ? Math.round(baseKobo * multiGuestDiscountPercent / 100) : 0;
  subtotal -= multiGuestDiscountKobo;

  const hourlyDiscountPercent = computeHourlyDiscount(hours, listing?.pricing);
  const hourlyDiscountKobo = hourlyDiscountPercent > 0 ? Math.round(baseKobo * hourlyDiscountPercent / 100) : 0;
  subtotal -= hourlyDiscountKobo;

  const venueSpendDiscountPercent = computeVenueSpendDiscount(subtotal, listing?.pricing);
  const venueSpendDiscountKobo = venueSpendDiscountPercent > 0 ? Math.round(subtotal * venueSpendDiscountPercent / 100) : 0;
  subtotal -= venueSpendDiscountKobo;

  const totalAmountKobo = Math.max(0, Math.round(subtotal));
  const commissionRate = listing?.pricing?.commissionRatePercent ?? 5;
  const commissionKobo = computeCommission(totalAmountKobo, listing?.pricing);

  const exclusiveFeeKobo = listing?.booking_type === "exclusive" ? computeExclusiveFeeKobo(listing) : 0;

  return {
    baseRatePerHour,
    headcount: people,
    hours,
    baseKobo,
    selectedAddOnsKobo,
    multiGuestDiscountPercent,
    multiGuestDiscountKobo,
    hourlyDiscountPercent,
    hourlyDiscountKobo,
    venueSpendDiscountPercent,
    venueSpendDiscountKobo,
    exclusiveFeeKobo,
    totalAmountKobo: totalAmountKobo + exclusiveFeeKobo,
    commissionRate,
    commissionKobo: computeCommission(totalAmountKobo + exclusiveFeeKobo, listing?.pricing),
    paystackFeeKobo: computePaystackFeeKobo(totalAmountKobo + exclusiveFeeKobo),
  };
}