import { NextResponse } from "next/server";
import { parseSessionToken, verifyClerkSession, getClerkUser } from "@/lib/getSessionUser";
import { findUserByClerkId } from "@/lib/supabase-queries";

export async function GET(request) {
  try {
    const sessionInfo = parseSessionToken(request);
    if (!sessionInfo?.userId) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    const isValid = await verifyClerkSession(sessionInfo.sessionId);
    if (!isValid) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const clerkUser = await getClerkUser(sessionInfo.userId);
    if (!clerkUser) {
      return NextResponse.json({ authenticated: true, completed: false });
    }

    // Clerk metadata is the source of truth for profile completion
    if (clerkUser.profileCompleted) {
      const redirects = {
        guest: "/dashboard",
        host: "/host/dashboard",
        admin: "/management-portal-x7q",
      };
      return NextResponse.json({
        authenticated: true,
        completed: true,
        redirectTo: redirects[clerkUser.activeRole] || "/dashboard",
      });
    }

    // Fallback: check Supabase for profile completion (best-effort)
    try {
      const dbUser = await findUserByClerkId(sessionInfo.userId);
      if (dbUser?.profile_completed) {
        const redirects = {
          guest: "/dashboard",
          host: "/host/dashboard",
          admin: "/management-portal-x7q",
        };
        return NextResponse.json({
          authenticated: true,
          completed: true,
          redirectTo: redirects[dbUser.active_role] || "/dashboard",
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