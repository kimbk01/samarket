import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "legacy_oauth_start_disabled",
      message: "SAMarket OAuth flow is standardized to Supabase Auth signInWithOAuth.",
    },
    { status: 410 }
  );
}

export function OPTIONS() {
  return NextResponse.json({ ok: true });
}
