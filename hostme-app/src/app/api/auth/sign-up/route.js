import { NextResponse } from "next/server";
import { clerkFetch } from "@/lib/clerk";
import { createUser } from "@/lib/supabase-queries";
import { getRedirectPath } from "@/lib/redirect";

export async function POST(request) {
  try {
    const { email, password } = await request.json();
    const trimmedEmail = email?.trim();

    if (!trimmedEmail || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    let clerkUser;

    try {
      const name = trimmedEmail.split("@")[0] || "User";
      clerkUser = await clerkFetch("/users", {
        method: "POST",
        body: JSON.stringify({
          email_address: [trimmedEmail],
          password,
          first_name: name,
          last_name: "",
        }),
      });
    } catch (createErr) {
      const isDuplicate = createErr.errors?.some(
        e => e.code === "duplicate_email" || e.code === "form_identifier_exists" || e.message?.toLowerCase().includes("already in use")
      );
      if (isDuplicate) {
        let found = null;
        const variants = [...new Set([trimmedEmail, trimmedEmail.toLowerCase(), trimmedEmail.toUpperCase()])];
        for (const variant of variants) {
          const resp = await clerkFetch(`/users?email_address=${encodeURIComponent(variant)}`);
          const users = Array.isArray(resp) ? resp : (resp.data || []);
          if (users.length > 0) { found = users[0]; break; }
        }
        if (!found) {
          return NextResponse.json({ error: "Account exists but could not be found. Try signing in." }, { status: 409 });
        }
        clerkUser = found;
        const verifyRes = await clerkFetch(`/users/${clerkUser.id}/verify_password`, {
          method: "POST",
          body: JSON.stringify({ password }),
        });
        if (!verifyRes.verified) {
          return NextResponse.json({ error: "An account with this email already exists but the password is incorrect." }, { status: 409 });
        }
      } else {
        throw createErr;
      }
    }

    const session = await clerkFetch("/sessions", {
      method: "POST",
      body: JSON.stringify({ user_id: clerkUser.id }),
    });

    const token = await clerkFetch(`/sessions/${session.id}/tokens`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    // Try to create Supabase user record (best-effort, never blocks)
    try {
      await createUser({
        clerk_id: clerkUser.id,
        name: trimmedEmail.split("@")[0] || "User",
        email: trimmedEmail,
        roles: ["guest"],
        active_role: "guest",
        is_email_verified: true,
        email_verified_at: new Date().toISOString(),
        status: "active",
        profile_completed: false,
      });
    } catch {
      // Supabase unavailable — profile will be saved on complete-profile
    }

    const meta = clerkUser.public_metadata || {};
    const redirectTo = getRedirectPath({
      roles: meta.roles || ["guest"],
      activeRole: meta.activeRole || "guest",
      profileCompleted: meta.profileCompleted || false,
    });

    const response = NextResponse.json({ success: true, redirectTo });

    response.cookies.set("__session", token.jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    return NextResponse.json({ error: error.message || "Could not create account." }, { status: 400 });
  }
}