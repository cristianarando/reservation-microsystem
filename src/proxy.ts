// src/proxy.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js 16 Proxy (replaces middleware.ts).
 * Performs lightweight edge-free request checks without database calls:
 * - Cross-site mutation defense-in-depth on /api/*
 * - Optimistic no-store cache headers on /admin and /api/*
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      const secFetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
      if (secFetchSite === "cross-site") {
        return NextResponse.json(
          { error: "Solicitud cross-site bloqueada." },
          { status: 403 }
        );
      }
    }
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  if (pathname.startsWith("/admin")) {
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*"],
};
