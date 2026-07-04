import mongoose from "mongoose";

const ListingSchema = new mongoose.Schema(
    {
        hostId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        vertical: { type: String, enum: ["venue", "housing", "preorder"], required: true },
        bookingType: { type: String, enum: ["capacity", "exclusive"], required: true },
        physicalSpaceId: { type: String, default: null, index: true },
        status: {
            type: String,
            enum: ["draft", "pending_review", "active", "suspended", "rejected"],
            default: "draft",
        },
        title: { type: String, required: true },
        description: { type: String, required: true },
        location: {
            state: { type: String, required: true },
            cityArea: { type: String, required: true },
            address: { type: String, required: true },
            coordinates: {
                type: { type: String, enum: ["Point"], default: "Point" },
                coordinates: { type: [Number], required: true },
            },
        },
        pricing: {
            baseRatePerHour: { type: Number },
            inspectionTransportFee: { type: Number },
        },
        operationalRules: {
            maxCapacity: { type: Number, required: true },
            setupBufferMinutes: { type: Number, default: 30 },
            teardownBufferMinutes: { type: Number, default: 30 },
            isByobAllowed: { type: Boolean, default: false },
            cancellationPolicy: { type: String, enum: ["flexible", "moderate", "strict"], default: "moderate" },
        },
        rejectionReason: { type: String, default: null },
        addOns: [
            {
                id: { type: String, required: true },
                name: { type: String, required: true },
                priceInKobo: { type: Number, required: true },
                isRequired: { type: Boolean, default: false },
            },
        ],
    },
    { timestamps: true }
);

ListingSchema.index({ location: "2dsphere" });
ListingSchema.index({ vertical: 1, "location.cityArea": 1, status: 1 });

export const Listing = mongoose.models.Listing || mongoose.model("Listing", ListingSchema);
