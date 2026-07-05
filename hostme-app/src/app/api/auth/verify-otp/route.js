import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { isOtpExpired } from "@/lib/password";

export async function POST(request) {
    try {
        const payload = await request.json();
        const email = String(payload?.email || "").trim().toLowerCase();
        const otpCode = String(payload?.otpCode || "").trim();

        if (!email || !otpCode) {
            return Response.json({ error: "Email and OTP are required" }, { status: 400 });
        }

        await connectToDatabase();
        const user = await User.findOne({ email });
        if (!user) {
            return Response.json({ error: "User not found" }, { status: 404 });
        }

        if (user.isEmailVerified) {
            return Response.json({ ok: true, message: "Email already verified" });
        }

        if (user.otpCode !== otpCode || isOtpExpired(user.otpExpiresAt)) {
            return Response.json({ error: "Invalid or expired OTP" }, { status: 400 });
        }

        user.isEmailVerified = true;
        user.emailVerifiedAt = new Date();
        user.status = "active";
        user.otpCode = null;
        user.otpExpiresAt = null;
        await user.save();

        return Response.json({ ok: true, message: "Email verified successfully" });
    } catch (error) {
        console.error("OTP verification error", error);
        return Response.json({ error: "Failed to verify OTP" }, { status: 500 });
    }
}
