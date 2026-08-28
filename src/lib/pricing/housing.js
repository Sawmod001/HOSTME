/**
 * Housing pricing engine.
 *
 * All prices are in integer kobo (₦1 = 100 kobo).
 * Formula: nightly_rate × nights + cleaning_fee + service_fee(5%)
 * If a weekly rate is set and stay >= 7 nights, apply weekly discount.
 */

const SERVICE_FEE_PERCENT = 5;

/**
 * Compute the total price for a housing booking.
 *
 * @param {object} params
 * @param {number} params.nightlyRateKobo - Nightly rate in kobo
 * @param {number} [params.weeklyRateKobo] - Weekly rate in kobo (discount)
 * @param {number} [params.monthlyRateKobo] - Monthly rate in kobo (discount)
 * @param {number} [params.cleaningFeeKobo] - One-time cleaning fee in kobo
 * @param {number} params.nights - Number of nights
 * @returns {{ nightlyTotal: number, weeklyDiscount: number, monthlyDiscount: number, cleaningFee: number, subtotal: number, serviceFee: number, total: number }}
 */
export function computeHousingPriceKobo({
  nightlyRateKobo,
  weeklyRateKobo,
  monthlyRateKobo,
  cleaningFeeKobo = 0,
  nights,
}) {
  let nightlyTotal = nightlyRateKobo * nights;
  let weeklyDiscount = 0;
  let monthlyDiscount = 0;

  // Apply monthly discount if applicable (>= 30 nights)
  if (monthlyRateKobo && monthlyRateKobo > 0 && nights >= 30) {
    const fullMonths = Math.floor(nights / 30);
    const remainingNights = nights % 30;
    const monthlyPrice = monthlyRateKobo * fullMonths;
    const nightlyPriceForRemainder = nightlyRateKobo * remainingNights;
    const monthlyBasedTotal = monthlyPrice + nightlyPriceForRemainder;
    monthlyDiscount = nightlyTotal - monthlyBasedTotal;
    nightlyTotal = monthlyBasedTotal;
  } else if (weeklyRateKobo && weeklyRateKobo > 0 && nights >= 7) {
    const fullWeeks = Math.floor(nights / 7);
    const remainingNights = nights % 7;
    const weeklyPrice = weeklyRateKobo * fullWeeks;
    const nightlyPriceForRemainder = nightlyRateKobo * remainingNights;
    const weeklyBasedTotal = weeklyPrice + nightlyPriceForRemainder;
    weeklyDiscount = nightlyTotal - weeklyBasedTotal;
    nightlyTotal = weeklyBasedTotal;
  }

  const subtotal = nightlyTotal + cleaningFeeKobo;
  const serviceFee = Math.round(subtotal * SERVICE_FEE_PERCENT / 100);
  const total = subtotal + serviceFee;

  return {
    nightlyTotal,
    weeklyDiscount,
    monthlyDiscount,
    cleaningFee: cleaningFeeKobo,
    subtotal,
    serviceFee,
    total,
  };
}

/**
 * Validate that a stay meets min/max stay requirements.
 *
 * @param {object} params
 * @param {number} params.nights - Requested number of nights
 * @param {number} [params.minStayNights=1] - Minimum stay
 * @param {number} [params.maxStayNights] - Maximum stay (null = no limit)
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateStayDuration({ nights, minStayNights = 1, maxStayNights }) {
  if (nights < minStayNights) {
    return { valid: false, error: `Minimum stay is ${minStayNights} night${minStayNights > 1 ? "s" : ""}` };
  }
  if (maxStayNights && nights > maxStayNights) {
    return { valid: false, error: `Maximum stay is ${maxStayNights} night${maxStayNights > 1 ? "s" : ""}` };
  }
  return { valid: true };
}
