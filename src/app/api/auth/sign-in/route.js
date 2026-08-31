import { NextResponse } from "next/server";
import { clerkFetch } from "@/lib/auth/clerk";
import { getRedirectPath } from "@/lib/auth/redirect";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";

export async function POST(request) {
  try {
    const csrfFail = validateCsrfOrigin(request);
    if (csrfFail) return csrfFail;

    const rateLimited = checkRateLimit(request, { windowMs: 60_000, max: 10 }, "auth:signin");
    if (rateLimited) return rateLimited;

    const { email, password } = await request.json();
    const trimmedEmail = email?.trim();

    if (!trimmedEmail || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    // Clerk email lookup is case-insensitive for most instances — try lowercased first (fast path), then original.
    const variants = [...new Set([trimmedEmail.toLowerCase(), trimmedEmail])];
    let matchedUser = null;
    let lastFetchError = null;

    for (const variant of variants) {
      try {
        const resp = await clerkFetch(`/users?email_address=${encodeURIComponent(variant)}`);
        const users = Array.isArray(resp) ? resp : (resp.data || []);
        if (users.length > 0) {
          matchedUser = users[0];
          break;
        }
      } catch (e) {
        lastFetchError = e;
        // If it's a service-unavailable error, fail fast with 503 instead of masking as "invalid password"
        if (e.status === 503 || e.status === 500) throw e;
        // Otherwise try next variant
      }
    }

    if (!matchedUser) {
      if (lastFetchError && (lastFetchError.status === 503 || lastFetchError.status === 500)) {
        throw lastFetchError;
      }
      return NextResponse.json({
        error: "Invalid email or password.",
      }, { status: 401 });
    }

    const verifyRes = await clerkFetch(`/users/${matchedUser.id}/verify_password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });

    if (!verifyRes.verified) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const session = await clerkFetch("/sessions", {
      method: "POST",
      body: JSON.stringify({ user_id: matchedUser.id }),
    });

    const token = await clerkFetch(`/sessions/${session.id}/tokens`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    const meta = matchedUser.public_metadata || {};
    const redirectTo = getRedirectPath({ role: meta.role || "guest", profileCompleted: meta.profileCompleted });

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
    // Map service-unavailable to 503 so client can show retry-friendly message
    const status = error.status || 401;
    const message = error.message || "Invalid credentials.";
    // Don't leak internal stack traces for 500s; provide user-friendly fallback
    if (status >= 500) {
      return NextResponse.json({ error: message }, { status });
    }
    return NextResponse.json({ error: message }, { status });
  }
}