export async function resolveExclusiveLock({
    lockId,
    bookingId,
    listingId,
    eventStart,
    ExclusiveLock,
    Booking,
}) {
    if (!lockId || !bookingId || !listingId || !eventStart || !ExclusiveLock || !Booking) {
        return { ok: false, error: "Missing exclusive lock parameters" };
    }

    const lock = await ExclusiveLock.findOneAndUpdate(
        { _id: lockId, status: "open" },
        { $set: { status: "locked", lockedByBookingId: bookingId } },
        { new: true }
    );

    if (!lock) {
        await Booking.updateOne({ _id: bookingId }, { status: "lost_race" });
        return { won: false, bookingId };
    }

    await Booking.updateOne({ _id: bookingId }, { status: "confirmed" });
    await Booking.updateMany(
        {
            listingId,
            eventStart,
            _id: { $ne: bookingId },
            status: { $in: ["pending", "awaiting_payment"] },
        },
        { status: "rejected" }
    );

    return { won: true, bookingId, lock };
}

export async function markWebhookProcessing({ BookingModel, bookingId, gatewayTransactionRef }) {
    if (!BookingModel || !bookingId || !gatewayTransactionRef) {
        return { ok: false, error: "Missing webhook processing parameters" };
    }

    try {
        await BookingModel.updateOne(
            { _id: bookingId, gatewayTransactionRef: { $exists: false } },
            { gatewayTransactionRef }
        );
        return { ok: true, duplicate: false };
    } catch (error) {
        if (error?.code === 11000) {
            return { ok: false, duplicate: true };
        }
        throw error;
    }
}
