import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Legacy callback entrypoint.
 * OAuth return flow is standardized to `/auth/callback` (Supabase Auth).
 */
export async function GET(req: NextRequest) {
  const forward = new URL("/auth/callback", req.url);
  for (const [key, value] of req.nextUrl.searchParams.entries()) {
    forward.searchParams.set(key, value);
  }
  return NextResponse.redirect(forward);
}
