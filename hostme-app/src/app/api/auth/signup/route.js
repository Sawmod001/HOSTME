import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { hashPassword, createOtpCode } from "@/lib/password";

export async function POST(request) {
    try {
        const payload = await request.json();
        const email = String(payload?.email || "").trim().toLowerCase();
        const password = String(payload?.password || "");
        const fullName = String(payload?.fullName || "").trim();
        const role = String(payload?.role || "guest").toLowerCase();

        if (!email || !password || !fullName) {
            return Response.json({ error: "Email, password and full name are required" }, { status: 400 });
        }

        if (!["guest", "host", "admin"].includes(role)) {
            return Response.json({ error: "Invalid role" }, { status: 400 });
        }

        await connectToDatabase();

        const existing = await User.findOne({ email });
        if (existing) {
            return Response.json({ error: "An account with this email already exists" }, { status: 409 });
        }

        const otpCode = createOtpCode();
        const user = await User.create({
            email,
            name: fullName,
            passwordHash: hashPassword(password),
            roles: [role],
            activeRole: role,
            status: "pending",
            isEmailVerified: false,
            otpCode,
            otpExpiresAt: new Date(Date.now() + 1000 * 60 * 10),
            profile: {
                fullName,
                phone: payload?.phone || null,
                gender: payload?.gender || null,
                location: payload?.location || null,
            },
            profileCompleted: false,
        });

        return Response.json({
            ok: true,
            message: "Account created. Please verify your email with the OTP.",
            userId: user._id.toString(),
            otpCode,
        });
    } catch (error) {
        console.error("Signup error", error);
        return Response.json({ error: "Failed to create account" }, { status: 500 });
    }
}
