import { NextResponse } from "next/server";
import { findUserByClerkId, createUser, updateUserByClerkId } from "@/lib/supabase-queries";
import { clerkFetch } from "@/lib/clerk";

export async function POST(request) {
  try {
    const { email, password, name } = await request.json();
    if (!email?.trim() || !password || !name?.trim()) {
      return NextResponse.json({ error: "Email, password, and name are required." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return NextResponse.json({
        error: "Password must include uppercase, lowercase, a number, and a special character (e.g. Admin@1234).",
      }, { status: 400 });
    }

    const existingResp = await clerkFetch(`/users?email_address=${encodeURIComponent(email.trim())}`);
    const existingUsers = Array.isArray(existingResp) ? existingResp : (existingResp.data || []);
    if (existingUsers.length > 0) {
      const existing = existingUsers[0];
      const existingMeta = existing.public_metadata || {};
      const existingRoles = existingMeta.roles || [];

      if (existingRoles.includes("admin")) {
        return NextResponse.json({ error: "An admin user with this email already exists." }, { status: 409 });
      }

      await clerkFetch(`/users/${existing.id}/metadata`, {
        method: "PATCH",
        body: JSON.stringify({
          public_metadata: {
            roles: [...new Set([...existingRoles, "admin"])],
            activeRole: "admin",
            profileCompleted: true,
          },
        }),
      });

      try {
        let user = await findUserByClerkId(existing.id);
        if (user) {
          await updateUserByClerkId(existing.id, {
            roles: [...new Set([...(user.roles || []), "admin"])],
            active_role: "admin",
            profile_completed: true,
          });
        } else {
          await createUser({
            clerk_id: existing.id,
            name: name.trim(),
            email: email.trim(),
            roles: [...new Set([...existingRoles, "admin"])],
            active_role: "admin",
            profile_completed: true,
            is_email_verified: true,
            email_verified_at: new Date().toISOString(),
            status: "active",
          });
        }
      } catch (dbError) {
        console.error("[admin-setup] DB unavailable, saved Clerk metadata only", dbError);
      }

      return NextResponse.json({ success: true, message: "Existing user promoted to admin." });
    }

    const clerkUser = await clerkFetch("/users", {
      method: "POST",
      body: JSON.stringify({ email_address: [email.trim()], password }),
    });

    await clerkFetch(`/users/${clerkUser.id}/metadata`, {
      method: "PATCH",
      body: JSON.stringify({
        public_metadata: { roles: ["admin"], activeRole: "admin", profileCompleted: true },
      }),
    });

    try {
      await createUser({
        clerk_id: clerkUser.id,
        name: name.trim(),
        email: email.trim(),
        roles: ["admin"],
        active_role: "admin",
        profile_completed: true,
        is_email_verified: true,
        email_verified_at: new Date().toISOString(),
        status: "active",
      });
    } catch (dbError) {
      console.error("[admin-setup] DB unavailable, saved Clerk metadata only", dbError);
    }

    return NextResponse.json({
      success: true,
      message: "Admin user created. Sign in at /sign-in with the email and password you provided.",
    });
  } catch (error) {
    console.error("[admin-setup] Error:", error);
    return NextResponse.json({ error: error.message || "Failed to create admin user." }, { status: 500 });
  }
}