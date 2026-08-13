export function hoursBetween(start, end) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, ms / (1000 * 60 * 60));
}

function addonPriceKobo(addon) {
  return Number(addon.priceInKobo ?? addon.price_in_kobo ?? addon.priceKobo ?? 0) || 0;
}

export function computeCapacityPriceKobo({ listing, eventStart, eventEnd, headcount, addOnIds = [], includeRequired = false }) {
  const baseRatePerHour = Number(listing?.pricing?.baseRatePerHour) || 0;
  const people = Math.max(1, Number(headcount) || 0);
  const hours = hoursBetween(eventStart, eventEnd);
  const baseKobo = baseRatePerHour * people * hours;

  const menu = new Map((listing?.add_ons || []).map((a) => [a.id, addonPriceKobo(a)]));
  let addOnsKobo = [...new Set(addOnIds || [])].reduce((sum, id) => sum + (menu.get(id) || 0), 0);
  if (includeRequired) {
    addOnsKobo += (listing?.add_ons || []).filter((a) => a.isRequired).reduce((sum, a) => sum + addonPriceKobo(a), 0);
  }

  return Math.round(baseKobo + addOnsKobo);
}