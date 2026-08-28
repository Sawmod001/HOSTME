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