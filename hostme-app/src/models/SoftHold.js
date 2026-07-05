import mongoose from "mongoose";

const SoftHoldSchema = new mongoose.Schema(
    {
        slotId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Slot",
            required: true,
            index: true,
        },
        headcount: { type: Number, required: true, min: 1 },
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            default: null,
            index: true,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: { expires: 0 }, // TTL index: auto-delete 0 seconds after expiresAt
        },
    },
    { timestamps: true }
);

export const SoftHold = mongoose.models.SoftHold || mongoose.model("SoftHold", SoftHoldSchema);
