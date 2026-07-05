import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        email: { type: String, required: true, unique: true, sparse: true, index: true },
        passwordHash: { type: String, default: null },
        phone: { type: String, default: null },
        roles: { type: [String], default: ["guest"] },
        activeRole: { type: String, default: "guest" },
        emailVerifiedAt: { type: Date, default: null },
        status: {
            type: String,
            enum: ["active", "suspended", "pending"],
            default: "active",
        },
        isEmailVerified: { type: Boolean, default: false },
        otpCode: { type: String, default: null },
        otpExpiresAt: { type: Date, default: null },
        profileCompleted: { type: Boolean, default: false },
        profile: {
            fullName: { type: String, default: null },
            phone: { type: String, default: null },
            gender: { type: String, default: null },
            location: { type: String, default: null },
            bio: { type: String, default: null },
        },
    },
    { timestamps: true }
);

export const User = mongoose.models.User || mongoose.model("User", UserSchema);
