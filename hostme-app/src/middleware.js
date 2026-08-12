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
]);

const PUBLIC_API_PREFIXES = ["/api/listings", "/api/debug", "/api/group-plans"];

// Group-plan POSTs carry their own identity (Clerk session or signed guest
// token) and are rate-limited at the route; gate at the route, not here.
const PUBLIC_API_ANY_METHOD = ["/api/group-plans"];

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
        for (const anyMethod of PUBLIC_API_ANY_METHOD) {
          if (pathname.startsWith(anyMethod) && method === "POST") return NextResponse.next();
        }
        if (method === "GET" || method === "HEAD") return NextResponse.next();
        if (hasSession(request)) return NextResponse.next();
        return unauthorized(request);
      }
    }

    // Public page prefixes
    if (pathname.startsWith("/listings")) return NextResponse.next();
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
