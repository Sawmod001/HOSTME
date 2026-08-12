import { NextResponse } from "next/server";
import { clerkFetch } from "@/lib/clerk";
import { parseSessionToken, verifyClerkSession, getClerkUser } from "@/lib/getSessionUser";
import { findUserByClerkId, createUser, updateUserByClerkId } from "@/lib/supabase-queries";

export async function POST(request) {
  try {
    const sessionInfo = parseSessionToken(request);
    if (!sessionInfo?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
    if (!isValid) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    const clerkId = sessionInfo.userId;
    const payload = await request.json();
    const selectedRole = payload?.role === "host" ? "host" : "guest";
    const wantsHost = selectedRole === "host";

    if (wantsHost) {
      if (!payload?.businessName?.trim()) {
        return NextResponse.json({ error: "Business name is required for host accounts" }, { status: 400 });
      }
      if (!payload?.businessType) {
        return NextResponse.json({ error: "Business type is required for host accounts" }, { status: 400 });
      }
      if (!payload?.termsAccepted) {
        return NextResponse.json({ error: "You must accept the terms and conditions" }, { status: 400 });
      }
    }

    if (!payload?.phone?.trim()) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    const currentUser = await getClerkUser(clerkId);
    const currentRoles = currentUser?.roles || ["guest"];
    const newRoles = wantsHost
      ? [...new Set([...currentRoles, "guest", "host"])]
      : ["guest"];
    const newActiveRole = wantsHost ? "host" : "guest";

    // Save to Clerk public_metadata (reliable — always works)
    await clerkFetch(`/users/${clerkId}/metadata`, {
      method: "PATCH",
      body: JSON.stringify({
        public_metadata: {
          roles: newRoles,
          activeRole: newActiveRole,
          profileCompleted: true,
        },
      }),
    });

    // Try to save extended profile to Supabase (best-effort)
    try {
      let dbUser = await findUserByClerkId(clerkId);
      if (!dbUser) {
        const clerkUser = await clerkFetch(`/users/${clerkId}`);
        const email = clerkUser.email_addresses?.[0]?.email_address || "";
        const name = clerkUser.fullName || email || "User";
        dbUser = await createUser({
          clerk_id: clerkId,
          name,
          email,
          roles: ["guest"],
          active_role: "guest",
          is_email_verified: true,
          email_verified_at: new Date().toISOString(),
          status: "active",
          profile_completed: false,
        });
      }

      const profile = {
        ...(dbUser.profile || {}),
        fullName: payload?.fullName || dbUser.profile?.fullName || dbUser.name,
        phone: payload?.phone?.trim() || dbUser.profile?.phone || null,
        gender: payload?.gender || dbUser.profile?.gender || null,
        location: payload?.location?.trim() || dbUser.profile?.location || null,
        bio: payload?.bio || dbUser.profile?.bio || null,
        referralSource: payload?.referralSource || dbUser.profile?.referralSource || null,
        businessName: wantsHost ? payload?.businessName?.trim() || null : null,
        businessType: wantsHost ? payload?.businessType || null : null,
        operatingHours: wantsHost ? payload?.operatingHours?.trim() || null : null,
        termsAcceptedAt: wantsHost ? new Date().toISOString() : null,
      };

      await updateUserByClerkId(clerkId, {
        roles: newRoles,
        active_role: newActiveRole,
        profile_completed: true,
        status: "active",
        phone: payload?.phone?.trim() || dbUser.phone || null,
        profile,
      });
    } catch {
      // Supabase unavailable — Clerk metadata has all critical data
    }

    const redirectTo = wantsHost ? "/host/dashboard" : "/dashboard";

    return NextResponse.json({
      ok: true,
      data: { roles: newRoles, activeRole: newActiveRole, redirectTo },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to save profile" }, { status: 500 });
  }
}