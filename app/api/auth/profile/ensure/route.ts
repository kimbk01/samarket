import { NextRequest } from "next/server";
import { buildRequestSessionMeta } from "@/lib/auth/request-device-info";
import { syncActiveSessionForUser } from "@/lib/auth/server-guards";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  profileRowToEnsureApiPayload,
  runMeProfileReadPipeline,
} from "@/lib/profile/me-profile-read-pipeline";
import { jsonError, jsonOk, safeErrorMessage } from "@/lib/http/api-route";
import { enforceProfileEnsureQuota } from "@/lib/security/rate-limit-presets";
import { clearMeProfileGetRouteCache } from "@/lib/profile/me-profile-get-route-cache";
import { clearMeProfileResponseCachesForUser } from "@/lib/profile/me-profile-get-response-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 하위 호환·특수 옵션(`rotate_session=1`)용.
 * 일반 세션 하이드레이션은 **`GET /api/me/profile` 단일 경로**만 쓴다(`runMeProfileReadPipeline`).
 */
export async function POST(request: NextRequest) {
  const routeSb = await createSupabaseRouteHandlerClient();
  if (!routeSb) {
    return jsonError("인증 설정이 준비되지 않았습니다.", 503, { code: "supabase_unconfigured" });
  }
  const {
    data: { user },
    error,
  } = await routeSb.auth.getUser();
  if (error || !user) {
    return jsonError("로그인이 필요합니다.", 401, { code: "unauthorized" });
  }

  const ensureRl = await enforceProfileEnsureQuota(user.id);
  if (!ensureRl.ok) return ensureRl.response;

  clearMeProfileGetRouteCache(user.id);
  clearMeProfileResponseCachesForUser(user.id);

  const serviceSb = tryCreateSupabaseServiceClient();

  try {
    const row = await runMeProfileReadPipeline({
      authUserId: user.id,
      supabaseUser: user,
      routeSb,
      serviceSb,
    });
    if (!row) {
      return jsonError("프로필 동기화에 실패했습니다.", 500, { code: "profile_ensure_failed" });
    }

    const response = jsonOk({ profile: profileRowToEnsureApiPayload(row) });
    const rotateSession = request.nextUrl.searchParams.get("rotate_session") === "1";
    const sessionMeta = buildRequestSessionMeta(request);
    try {
      await syncActiveSessionForUser(user.id, response, {
        rotate: rotateSession,
        sessionMeta,
        loginIdentifier: row.auth_login_email ?? row.email ?? null,
        request,
      });
    } catch {
      /* 기존 ensure 와 동일 — 세션 레지스트리 실패로 500 을 내지 않음 */
    }
    return response;
  } catch (error) {
    return jsonError(safeErrorMessage(error, "프로필 동기화에 실패했습니다."), 500, {
      code: "profile_ensure_failed",
    });
  }
}
