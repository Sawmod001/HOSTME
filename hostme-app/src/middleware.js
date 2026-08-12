import { NextResponse } from "next/server";

function hasSession(request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").filter(Boolean).map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k.trim(), v.join("=")];
    })
  );
  return !!cookies["__session"];
}

function unauthorized(request) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/sign-in", request.url));
}

const PUBLIC_EXACT = new Set([
  "/", "/sign-in", "/sign-up", "/sso-callback", "/verify-email",
  "/complete-profile",
]);

const PUBLIC_API_EXACT = new Set([
  "/api/auth/sign-in", "/api/auth/sign-up", "/api/auth/logout",
  "/api/payments/webhook", "/api/payments/webhook/paystack", "/api/chat",
  "/api/whatsapp/webhook", "/api/cron/release-expired-holds",
  "/api/cron/cancel-expired-group-plans",
]);

const PUBLIC_API_PREFIXES = ["/api/listings", "/api/debug", "/api/group-plans"];

// Group-plan GETs (list + invite view) stay public; POST/PATCH/DELETE
// (create/join/pay/finalize) require a Clerk session, enforced in middleware.

export default function middleware(request) {
  try {
    const { pathname } = request.nextUrl;
    const method = request.method;

    // Exact public page matches
    if (PUBLIC_EXACT.has(pathname)) return NextResponse.next();

    // Exact public API matches
    if (PUBLIC_API_EXACT.has(pathname)) return NextResponse.next();

    // Public API prefixes — GET only, POST/PATCH/DELETE require auth
    for (const prefix of PUBLIC_API_PREFIXES) {
      if (pathname.startsWith(prefix)) {
        if (method === "GET" || method === "HEAD") return NextResponse.next();
        if (hasSession(request)) return NextResponse.next();
        return unauthorized(request);
      }
    }

    // Public page prefixes
    if (pathname.startsWith("/listings")) return NextResponse.next();
    // Group plan invite/list pages stay public, but starting a new plan
    // requires an account — that's the page that actually books.
    if (pathname === "/group-plans/new") {
      if (hasSession(request)) return NextResponse.next();
      return unauthorized(request);
    }
    if (pathname.startsWith("/group-plans")) return NextResponse.next();

    // Everything else requires a session
    if (!hasSession(request)) return unauthorized(request);
  } catch (e) {
    console.error("Middleware error:", e);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|.*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
