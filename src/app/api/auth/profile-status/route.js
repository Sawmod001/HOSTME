import { NextResponse } from "next/server";
import { parseSessionToken, verifyClerkSession, getClerkUser } from "@/lib/auth/getSessionUser";
import { findUserByClerkId } from "@/lib/db/supabase-queries";

const REDIRECTS = {
  guest: "/dashboard",
  venue_host: "/host/dashboard",
  shortlet_host: "/host/dashboard",
  admin: "/admin",
};

export async function GET(request) {
  try {
    const sessionInfo = parseSessionToken(request);
    if (!sessionInfo?.userId) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    const isValid = await verifyClerkSession(sessionInfo.sessionId, sessionInfo.userId);
    if (!isValid) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const clerkUser = await getClerkUser(sessionInfo.userId);
    if (!clerkUser) {
      return NextResponse.json({ authenticated: true, completed: false });
    }

    // Fast path: Clerk metadata is the source of truth when profile is completed
    if (clerkUser.profileCompleted) {
      const role = clerkUser.role || "guest";
      return NextResponse.json({
        authenticated: true,
        completed: true,
        redirectTo: REDIRECTS[role] || "/dashboard",
        role,
      });
    }

    // Slow path: check Supabase for profile completion (legacy users)
    try {
      const dbUser = await findUserByClerkId(sessionInfo.userId);
      if (dbUser?.profile_completed) {
        const role = dbUser.role || "guest";
        return NextResponse.json({
          authenticated: true,
          completed: true,
          redirectTo: REDIRECTS[role] || "/dashboard",
          role,
        });
      }
    } catch {
      // Supabase unavailable — Clerk metadata is authoritative
    }

    return NextResponse.json({ authenticated: true, completed: false });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }
}
