/**
 * Generate a receipt object for a confirmed booking.
 * Returns a structured receipt that can be displayed or exported.
 */
export function generateReceipt({ booking, listing, guest, payment }) {
  const snapshot = booking.pricing_snapshot || {};
  const breakdown = snapshot.breakdown || {};

  const items = [];

  // Base rate
  if (snapshot.baseKobo > 0) {
    items.push({
      label: `Base rate (${snapshot.hours || 1}h × ₦${((snapshot.baseRatePerHour || 0) / 100).toLocaleString()}/hr${snapshot.headcount > 1 ? ` × ${snapshot.headcount} guests` : ""})`,
      amountKobo: snapshot.baseKobo,
    });
  }

  // Add-ons
  if (snapshot.addOns?.length > 0) {
    for (const addon of snapshot.addOns) {
      items.push({
        label: addon.name || "Add-on",
        amountKobo: addon.price || 0,
      });
    }
  }

  // Multi-guest discount
  if (snapshot.multiGuestDiscountKobo > 0) {
    items.push({
      label: `Multi-guest discount (${snapshot.multiGuestDiscountPercent}%)`,
      amountKobo: -snapshot.multiGuestDiscountKobo,
    });
  }

  // Hourly discount
  if (snapshot.hourlyDiscountKobo > 0) {
    items.push({
      label: `Long booking discount (${snapshot.hourlyDiscountPercent}%)`,
      amountKobo: -snapshot.hourlyDiscountKobo,
    });
  }

  // Venue-spend discount
  if (snapshot.venueSpendDiscountKobo > 0) {
    items.push({
      label: `Loyalty discount (${snapshot.venueSpendDiscountPercent}%)`,
      amountKobo: -snapshot.venueSpendDiscountKobo,
    });
  }

  // Exclusive fee
  if (snapshot.exclusiveFeeKobo > 0) {
    items.push({
      label: "Exclusive space fee",
      amountKobo: snapshot.exclusiveFeeKobo,
    });
  }

  return {
    receiptId: `RCP-${booking.id.slice(0, 8).toUpperCase()}`,
    bookingId: booking.id,
    listingTitle: listing?.title || "Unknown listing",
    guestName: guest?.name || guest?.email || "Guest",
    guestEmail: guest?.email || "",
    eventStart: booking.event_start,
    eventEnd: booking.event_end,
    headcount: booking.headcount,
    bookingType: booking.booking_type,
    items,
    subtotalKobo: snapshot.totalAmountKobo || booking.total_amount_kobo,
    commissionKobo: snapshot.commissionKobo || booking.commission_kobo || 0,
    totalPaidKobo: booking.total_amount_kobo,
    paymentRef: booking.gateway_transaction_ref || "",
    paidAt: booking.paid_at || booking.created_at,
    status: booking.status,
    generatedAt: new Date().toISOString(),
  };
}
