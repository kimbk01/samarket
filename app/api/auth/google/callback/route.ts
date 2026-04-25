import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const forward = new URL("/api/auth/oauth/callback", req.url);
  for (const [key, value] of req.nextUrl.searchParams.entries()) {
    forward.searchParams.set(key, value);
  }
  if (!forward.searchParams.has("provider")) {
    forward.searchParams.set("provider", "google");
  }
  return NextResponse.redirect(forward);
}
