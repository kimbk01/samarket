import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { confirmDibayIdForUser } from "@/lib/auth/dibay-id-api-handlers";
import { clearMeProfileGetRouteCache } from "@/lib/profile/me-profile-get-route-cache";
import { clearMeProfileResponseCachesForUser } from "@/lib/profile/me-profile-get-response-cache";
import { clearProfileResponseCacheForUser } from "@/lib/profile/profile-response-cache";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** @deprecated — use /api/me/dibay-id/confirm */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

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

  const result = await confirmDibayIdForUser(sb, auth.userId, body);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  // `/api/me/dibay-id/confirm` 과 동일 — 확정 직후 GET /api/me/profile 이 이전 아이디를 돌려주지 않게
  clearMeProfileGetRouteCache(auth.userId);
  clearMeProfileResponseCachesForUser(auth.userId);
  clearProfileResponseCacheForUser(auth.userId);
  return NextResponse.json({
    ok: true,
    username: result.dibay_id,
    dibay_id: result.dibay_id,
    idempotent: result.idempotent === true,
  });
}
