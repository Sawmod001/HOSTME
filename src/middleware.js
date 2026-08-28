import { NextResponse } from "next/server";
import { SECURITY_HEADERS, generateCSP, detectAttacks } from "@/lib/security";
import { parseSessionToken } from "@/lib/auth/getSessionUser";

const PUBLIC_PATHS = [
  "/",
  "/sign-in",
  "/sign-up",
  "/complete-profile",
  "/listings",
  "/about",
  "/contact",
];

const PUBLIC_API_PREFIXES = [
  "/api/auth/sign-in",
  "/api/auth/sign-up",
  "/api/auth/profile-status",
  "/api/auth/admin-setup",
  "/api/payments/webhook/",
  "/api/whatsapp/webhook",
  "/api/health",
  "/api/search",
];

const PUBLIC_LISTING_API = [
  { prefix: "/api/listings", methods: ["GET"] },
  { prefix: "/api/listings/", methods: ["GET"] },
  { prefix: "/api/pricing/preview", methods: ["POST"] },
];

const ROLE_REDIRECT = {
  venue_host: "/host/dashboard",
  shortlet_host: "/host/dashboard",
  admin: "/admin",
  guest: "/dashboard",
};

function isPublicPath(pathname) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/listings/")) return true;
  return false;
}

function isPublicApi(pathname, method) {
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (PUBLIC_LISTING_API.some((r) => pathname.startsWith(r.prefix) && r.methods.includes(method))) return true;
  return false;
}

function isProtectedPath(pathname) {
  return (
    pathname.startsWith("/host") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/complete-profile")
  );
}

function isProtectedApi(pathname) {
  const protectedPrefixes = [
    "/api/bookings",
    "/api/soft-holds",
    "/api/host",
    "/api/admin",
    "/api/settings",
    "/api/notifications",
    "/api/messages",
    "/api/users",
    "/api/disputes",
    "/api/reports",
    "/api/documents",
    "/api/export",
    "/api/viewings",
    "/api/housing",
    "/api/provider",
    "/api/calendar",
    "/api/chat",
    "/api/analytics",
    "/api/reviews",
    "/api/listings",
  ];
  return protectedPrefixes.some((p) => pathname.startsWith(p));
}

function authFailResponse(request, pathname) {
  const isApi = pathname.startsWith("/api/");
  if (isApi) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL("/sign-in", request.url);
  url.searchParams.set("redirect", pathname);
  return NextResponse.redirect(url);
}

function profileIncompleteResponse(request, pathname) {
  const isApi = pathname.startsWith("/api/");
  if (isApi) {
    return NextResponse.json({ error: "Profile not completed" }, { status: 403 });
  }
  return NextResponse.redirect(new URL("/complete-profile", request.url));
}

function roleBlockedResponse(request, pathname, userRole) {
  const isApi = pathname.startsWith("/api/");
  if (isApi) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const redirectPath = ROLE_REDIRECT[userRole] || "/dashboard";
  return NextResponse.redirect(new URL(redirectPath, request.url));
}

/**
 * Security + Auth middleware for Next.js.
 * Applies security headers, threat detection, and route protection.
 */
export function middleware(request) {
  const response = NextResponse.next();
  const { pathname } = new URL(request.url);
  const { method } = request;

  // Apply security headers
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  response.headers.set("Content-Security-Policy", generateCSP());

  // Detect attacks in URL
  const { safe: urlSafe, threats: urlThreats } = detectAttacks(request.url);
  if (!urlSafe) {
    console.warn(`[Security] Threat detected in URL: ${urlThreats.join(", ")}`);
    return new NextResponse("Bad Request", { status: 400 });
  }

  // Detect attacks in query parameters
  const { searchParams } = new URL(request.url);
  for (const [, value] of searchParams) {
    const { safe, threats } = detectAttacks(value);
    if (!safe) {
      console.warn(`[Security] Threat detected in query param: ${threats.join(", ")}`);
      return new NextResponse("Bad Request", { status: 400 });
    }
  }

  // CSRF defense-in-depth for state-changing payment/booking routes
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    if (pathname.startsWith("/api/payments/") || pathname.startsWith("/api/bookings/")) {
      const origin = request.headers.get("origin");
      const host = request.headers.get("host");
      if (origin && host && !origin.includes(host)) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }
  }

  // Request ID
  response.headers.set("X-Request-ID", crypto.randomUUID());

  // === AUTH CHECKS ===
  const sessionInfo = parseSessionToken(request);
  const isAuthenticated = !!sessionInfo?.userId;

  // Public pages and APIs — skip auth
  if (isPublicPath(pathname) || isPublicApi(pathname, method)) {
    return response;
  }

  // Protected page requires auth
  if (isProtectedPath(pathname) && !isAuthenticated) {
    return authFailResponse(request, pathname);
  }

  // Protected API requires auth
  if (isProtectedApi(pathname) && !isAuthenticated) {
    return authFailResponse(request, pathname);
  }

  // Onboarding enforcement: authenticated user on protected page without completed profile
  if (isAuthenticated && isProtectedPath(pathname) && pathname !== "/complete-profile") {
    // Parse profileCompleted from JWT — avoids a DB call in middleware
    try {
      const cookieHeader = request.headers.get("cookie") || "";
      const cookies = Object.fromEntries(
        cookieHeader.split(";").filter(Boolean).map((c) => {
          const [k, ...v] = c.trim().split("=");
          return [k, v.join("=")];
        })
      );
      const token = cookies["__session"];
      if (token) {
        const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
        const meta = payload.public_metadata || {};
        if (meta.profileCompleted === false && pathname !== "/complete-profile") {
          return profileIncompleteResponse(request, pathname);
        }
      }
    } catch {
      // If we can't parse the token, let the API route handle it
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
