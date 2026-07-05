import test from "node:test";
import assert from "node:assert/strict";

import { resolveExclusiveLock, markWebhookProcessing } from "../src/lib/exclusive.js";

test("resolveExclusiveLock gives one booking the lock and marks the other as lost_race", async () => {
    const bookingStatuses = new Map();
    const updateManyCalls = [];
    let lockClaimed = false;

    const ExclusiveLockModel = {
        findOneAndUpdate: async () => {
            if (lockClaimed) {
                return null;
            }
            lockClaimed = true;
            return { _id: "lock-1", status: "open", lockedByBookingId: null };
        },
    };

    const BookingModel = {
        updateOne: async (filter, update) => {
            const bookingId = filter._id.toString();
            bookingStatuses.set(bookingId, update.status);
            return { modifiedCount: 1 };
        },
        updateMany: async (filter, update) => {
            updateManyCalls.push({ filter, update });
            return { modifiedCount: 2 };
        },
    };

    const [first, second] = await Promise.all([
        resolveExclusiveLock({
            lockId: "lock-1",
            bookingId: "booking-1",
            listingId: "listing-1",
            eventStart: "2026-07-05T18:00:00.000Z",
            ExclusiveLock: ExclusiveLockModel,
            Booking: BookingModel,
        }),
        resolveExclusiveLock({
            lockId: "lock-1",
            bookingId: "booking-2",
            listingId: "listing-1",
            eventStart: "2026-07-05T18:00:00.000Z",
            ExclusiveLock: ExclusiveLockModel,
            Booking: BookingModel,
        }),
    ]);

    assert.equal(first.won, true);
    assert.equal(second.won, false);
    assert.equal(bookingStatuses.get("booking-1"), "confirmed");
    assert.equal(bookingStatuses.get("booking-2"), "lost_race");
    assert.equal(updateManyCalls.length, 1);
});

test("markWebhookProcessing treats repeated gatewayTransactionRef as a no-op", async () => {
    let calls = 0;
    const BookingModel = {
        updateOne: async () => {
            calls += 1;
            if (calls === 2) {
                const error = new Error("duplicate");
                error.code = 11000;
                throw error;
            }
            return { modifiedCount: 1 };
        },
    };

    const first = await markWebhookProcessing({
        BookingModel,
        bookingId: "booking-1",
        gatewayTransactionRef: "ref-1",
    });
    const second = await markWebhookProcessing({
        BookingModel,
        bookingId: "booking-1",
        gatewayTransactionRef: "ref-1",
    });

    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    assert.equal(second.duplicate, true);
    assert.equal(calls, 2);
});

test("resolveExclusiveLock rejects siblings for the same listing and event window", async () => {
    const updateManyCalls = [];
    const ExclusiveLockModel = {
        findOneAndUpdate: async () => ({ _id: "lock-1", status: "open", lockedByBookingId: null }),
    };
    const BookingModel = {
        updateOne: async () => ({ modifiedCount: 1 }),
        updateMany: async (filter, update) => {
            updateManyCalls.push({ filter, update });
            return { modifiedCount: 2 };
        },
    };

    await resolveExclusiveLock({
        lockId: "lock-1",
        bookingId: "booking-3",
        listingId: "listing-1",
        eventStart: "2026-07-05T18:00:00.000Z",
        ExclusiveLock: ExclusiveLockModel,
        Booking: BookingModel,
    });

    assert.equal(updateManyCalls.length, 1);
    assert.deepEqual(updateManyCalls[0].filter, {
        listingId: "listing-1",
        eventStart: "2026-07-05T18:00:00.000Z",
        _id: { $ne: "booking-3" },
        status: { $in: ["pending", "awaiting_payment"] },
    });
    assert.equal(updateManyCalls[0].update.status, "rejected");
});
