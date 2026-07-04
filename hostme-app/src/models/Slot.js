import mongoose from "mongoose";

const SlotSchema = new mongoose.Schema(
    {
        listingId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
        eventStart: { type: Date, required: true },
        eventEnd: { type: Date, required: true },
        capacity: { type: Number, required: true },
        booked: { type: Number, default: 0, required: true },
        heldUntil: { type: Date, default: null },
    },
    { timestamps: true }
);

SlotSchema.index({ listingId: 1, eventStart: 1 }, { unique: true });

export const Slot = mongoose.models.Slot || mongoose.model("Slot", SlotSchema);
