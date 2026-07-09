import { NextResponse } from "next/server";
import { assignAutoDibayIdForUser } from "@/lib/auth/assign-auto-dibay-id.server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { clearMeProfileGetRouteCache } from "@/lib/profile/me-profile-get-route-cache";
import { clearMeProfileResponseCachesForUser } from "@/lib/profile/me-profile-get-response-cache";
import { clearProfileResponseCacheForUser } from "@/lib/profile/profile-response-cache";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 예외적으로 dibay_id 가 없을 때 서버 자동 복구 */
export async function POST() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_role_required" }, { status: 503 });
  }

  const result = await assignAutoDibayIdForUser(sb, auth.userId);
  if (!result.ok) {
    const status = result.error === "skip_user_confirmed" ? 409 : result.error === "forbidden" ? 403 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  clearMeProfileGetRouteCache(auth.userId);
  clearMeProfileResponseCachesForUser(auth.userId);
  clearProfileResponseCacheForUser(auth.userId);

  return NextResponse.json({
    ok: true,
    dibay_id: result.dibay_id,
    idempotent: result.idempotent === true,
    skipped: result.skipped === true,
  });
}
