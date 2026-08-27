import { NextResponse } from "next/server";
import { SECURITY_HEADERS, generateCSP, detectAttacks } from "@/lib/security";

/**
 * Security middleware for Next.js.
 * Applies security headers and basic threat detection.
 */
export function middleware(request) {
  const response = NextResponse.next();

  // Apply security headers
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  response.headers.set("Content-Security-Policy", generateCSP());

  // Detect attacks in URL
  const url = request.url;
  const { safe: urlSafe, threats: urlThreats } = detectAttacks(url);
  if (!urlSafe) {
    console.warn(`[Security] Threat detected in URL: ${urlThreats.join(", ")}`);
    return new NextResponse("Bad Request", { status: 400 });
  }

  // Detect attacks in query parameters
  const { searchParams } = new URL(url);
  for (const [, value] of searchParams) {
    const { safe, threats } = detectAttacks(value);
    if (!safe) {
      console.warn(`[Security] Threat detected in query param: ${threats.join(", ")}`);
      return new NextResponse("Bad Request", { status: 400 });
    }
  }

  // Rate limiting headers
  const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  response.headers.set("X-Request-ID", crypto.randomUUID());

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public files (images, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
