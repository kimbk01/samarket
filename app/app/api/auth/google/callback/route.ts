import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Compatibility route for OAuth dashboards that were configured with `/app/api/...`.
 * The real Next.js route is `/api/auth/google/callback`.
 */
export async function GET(req: NextRequest) {
  const forward = new URL("/api/auth/google/callback", req.url);
  for (const [key, value] of req.nextUrl.searchParams.entries()) {
    forward.searchParams.set(key, value);
  }
  return NextResponse.redirect(forward);
}
