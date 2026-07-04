import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        email: { type: String, required: true, unique: true, sparse: true, index: true },
        phone: { type: String, default: null },
        roles: { type: [String], default: ["guest"] },
        activeRole: { type: String, default: "guest" },
        status: {
            type: String,
            enum: ["active", "suspended", "pending"],
            default: "active",
        },
    },
    { timestamps: true }
);

export const User = mongoose.models.User || mongoose.model("User", UserSchema);
