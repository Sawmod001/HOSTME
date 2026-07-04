import mongoose from "mongoose";

const BookingSchema = new mongoose.Schema(
    {
        listingId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
        guestId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        bookingType: { type: String, enum: ["capacity", "exclusive"], required: true },
        eventStart: { type: Date, required: true },
        eventEnd: { type: Date, required: true },
        headcount: { type: Number, required: true },
        status: {
            type: String,
            enum: [
                "pending",
                "awaiting_payment",
                "confirmed",
                "rejected",
                "lost_race",
                "expired",
                "cancelled",
                "completed",
                "disputed",
            ],
            required: true,
            default: "pending",
        },
        gatewayTransactionRef: { type: String, index: true, sparse: true },
        totalAmountKobo: { type: Number, required: true },
        commissionKobo: { type: Number, required: true },
    },
    { timestamps: true }
);

BookingSchema.index({ gatewayTransactionRef: 1 }, { unique: true, sparse: true });

export const Booking = mongoose.models.Booking || mongoose.model("Booking", BookingSchema);
