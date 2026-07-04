import mongoose from "mongoose";

const ExclusiveLockSchema = new mongoose.Schema(
    {
        listingId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
        eventStart: { type: Date, required: true },
        eventEnd: { type: Date, required: true },
        status: { type: String, enum: ["open", "locked"], default: "open" },
        lockedByBookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },
    },
    { timestamps: true }
);

ExclusiveLockSchema.index({ listingId: 1, eventStart: 1 }, { unique: true });

export const ExclusiveLock = mongoose.models.ExclusiveLock || mongoose.model("ExclusiveLock", ExclusiveLockSchema);
