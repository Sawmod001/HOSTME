import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";

export async function POST(request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const payload = await request.json();
        await connectToDatabase();

        const user = await User.findById(session.user.id);
        if (!user) {
            return Response.json({ error: "User not found" }, { status: 404 });
        }

        if (!user.isEmailVerified) {
            return Response.json({ error: "Please verify your email before completing your profile" }, { status: 400 });
        }

        user.profile = {
            ...(user.profile || {}),
            fullName: payload?.fullName || user.profile?.fullName || user.name,
            phone: payload?.phone || user.profile?.phone || null,
            gender: payload?.gender || user.profile?.gender || null,
            location: payload?.location || user.profile?.location || null,
            bio: payload?.bio || user.profile?.bio || null,
        };
        user.profileCompleted = true;
        user.status = "active";
        await user.save();

        return Response.json({ ok: true, user: user.toObject() });
    } catch (error) {
        console.error("Complete profile error", error);
        return Response.json({ error: "Failed to save profile" }, { status: 500 });
    }
}
