import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Exclude static assets from basic auth
  if (
    pathname.startsWith("/_next") ||
    pathname.includes(".") || // files like favicon.ico, logo.png
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // 2. Load configured credentials (fallback to admin/dhfflavlr%404 if not set)
  const basicAuthUser = process.env.BASIC_AUTH_USER || "admin";
  const basicAuthPassword = process.env.BASIC_AUTH_PASSWORD || "dhfflavlr%404";
  const cronSecret = process.env.CRON_SECRET;

  // 3. Inspect the standard HTTP Authorization header
  const authorizationHeader = req.headers.get("authorization");

  // 4. Special handling for Vercel Cron Sync API
  if (pathname.startsWith("/api/cron/sync")) {
    // Allow Vercel Cron with Bearer token
    if (cronSecret && authorizationHeader === `Bearer ${cronSecret}`) {
      return NextResponse.next();
    }
    // Allow local development sync without CRON_SECRET
    if (process.env.NODE_ENV === "development") {
      return NextResponse.next();
    }
  }

  // 5. Inspect standard HTTP Basic Authorization header
  if (authorizationHeader && authorizationHeader.startsWith("Basic ")) {
    // Expected format: "Basic <base64Credentials>"
    const base64Value = authorizationHeader.split(" ")[1];
    if (base64Value) {
      try {
        const decoded = atob(base64Value);
        const [username, password] = decoded.split(":");
        
        if (username === basicAuthUser && password === basicAuthPassword) {
          return NextResponse.next();
        }
      } catch (err) {
        console.error("Basic Auth decoding failed:", err);
      }
    }
  }

  // 6. Return HTTP 401 Unauthorized with WWW-Authenticate challenge header
  // This prompts the browser to show the native login dialog
  return new NextResponse("Access Denied: Authentication Required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Protected Area"',
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

// Optimization: Ensure middleware only runs on routes we actually care about protecting
export const config = {
  matcher: [
    /*
     * Match all request paths except for static files and images
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
