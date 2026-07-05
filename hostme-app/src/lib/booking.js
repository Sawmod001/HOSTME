export async function reserveCapacitySlot({
    slotId,
    listingId,
    headcount,
    SlotModel,
    SoftHoldModel,
    BookingModel,
    expiresInMinutes = 10,
}) {
    if (!slotId || !listingId || !headcount) {
        return { ok: false, status: 400, error: "Missing reservation parameters" };
    }

    if (headcount < 1) {
        return { ok: false, status: 400, error: "Headcount must be at least 1" };
    }

    const updatedSlot = await SlotModel.findOneAndUpdate(
        {
            _id: slotId,
            listingId,
            $expr: {
                $lte: [{ $add: ["$booked", headcount] }, "$capacity"],
            },
        },
        { $inc: { booked: headcount } },
        { new: true }
    );

    if (!updatedSlot) {
        return { ok: false, status: 409, error: "Slot is full or unavailable" };
    }

    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    const softHold = await SoftHoldModel.create({
        slotId,
        headcount,
        expiresAt,
        bookingId: null,
    });

    return {
        ok: true,
        status: 201,
        data: {
            slotId,
            softHoldId: softHold._id,
            expiresAt,
            headcount,
            booked: updatedSlot.booked,
            capacity: updatedSlot.capacity,
        },
    };
}
