import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceMemberIdApiRateLimit } from "@/lib/auth/member-id-api-rate-limit";
import { reserveDibayIdForUser } from "@/lib/auth/dibay-id-api-handlers";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** @deprecated — use /api/me/dibay-id/reserve */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceMemberIdApiRateLimit(req, auth.userId, "reserve");
  if (!rateLimit.ok) return rateLimit.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_role_required" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await reserveDibayIdForUser(sb, auth.userId, body);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    available: result.available,
    normalized: result.normalized,
  });
}
