import test from "node:test";
import assert from "node:assert/strict";

import { reserveCapacitySlot } from "../src/lib/booking.js";

test("reserveCapacitySlot allows one reservation when capacity is exhausted", async () => {
    let booked = 0;

    const slotModel = {
        findOneAndUpdate: async () => {
            if (booked >= 4) {
                return null;
            }

            booked += 4;
            return {
                _id: "slot-1",
                listingId: "listing-1",
                booked,
                capacity: 4,
            };
        },
    };

    const softHoldModel = {
        create: async (payload) => ({ _id: "soft-hold-1", ...payload }),
    };

    const bookingModel = {
        create: async (payload) => ({ _id: "booking-1", ...payload }),
    };

    const first = await reserveCapacitySlot({
        slotId: "slot-1",
        listingId: "listing-1",
        headcount: 4,
        SlotModel: slotModel,
        SoftHoldModel: softHoldModel,
        BookingModel: bookingModel,
    });

    const second = await reserveCapacitySlot({
        slotId: "slot-1",
        listingId: "listing-1",
        headcount: 1,
        SlotModel: slotModel,
        SoftHoldModel: softHoldModel,
        BookingModel: bookingModel,
    });

    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    assert.equal(second.status, 409);
    assert.equal(booked, 4);
});
