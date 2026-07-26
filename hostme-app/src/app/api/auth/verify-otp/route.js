import { NextResponse } from "next/server";
import { clerkFetch } from "@/lib/clerk";

export async function POST(request) {
  try {
    const { emailAddressId, code } = await request.json();

    if (!emailAddressId || !code) {
      return NextResponse.json({ error: "Verification ID and code are required." }, { status: 400 });
    }

    const result = await clerkFetch(`/email_addresses/${emailAddressId}/attempt_verification`, {
      method: "POST",
      body: JSON.stringify({ code }),
    });

    if (!result.verified || result.verification?.status !== "verified") {
      const attemptsRemaining = result.verification?.attempts || 0;
      return NextResponse.json({
        error: attemptsRemaining > 0
          ? `Invalid code. ${attemptsRemaining} attempt(s) remaining.`
          : "Invalid or expired code. Please request a new one.",
      }, { status: 400 });
    }

    const session = await clerkFetch("/sessions", {
      method: "POST",
      body: JSON.stringify({ user_id: result.user_id }),
    });

    const token = await clerkFetch(`/sessions/${session.id}/tokens`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = NextResponse.json({
      success: true,
      redirectTo: "/complete-profile",
    });

    response.cookies.set("__session", token.jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("[verify-otp] Error:", error);
    const message = error.message || "Verification failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
