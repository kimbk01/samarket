import { NextRequest } from "next/server";
import { buildRequestSessionMeta } from "@/lib/auth/request-device-info";
import { syncActiveSessionForUser } from "@/lib/auth/server-guards";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { ensureAuthProfileRow } from "@/lib/auth/member-access";
import { jsonError, jsonOk, safeErrorMessage } from "@/lib/http/api-route";
import { enforceProfileEnsureQuota } from "@/lib/security/rate-limit-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const serviceSb = tryCreateSupabaseServiceClient();
  if (!serviceSb) {
    return jsonError("프로필 동기화 구성이 준비되지 않았습니다.", 503, {
      code: "supabase_service_unconfigured",
    });
  }

  try {
    const state = await ensureAuthProfileRow(serviceSb, user);
    const response = jsonOk({
      profile: {
        id: state.userId,
        email: state.email ?? "",
        display_name: state.nickname,
        nickname: state.nickname,
        avatar_url: state.avatarUrl,
        username: state.username,
        role: state.role,
        status: state.status,
        member_type: state.memberType,
        phone: state.phone,
        phone_country_code: state.phoneCountryCode ?? "+63",
        phone_number: state.phoneNumber ?? null,
        phone_verified: state.phoneVerified,
        phone_verified_at: state.phoneVerifiedAt ?? null,
        phone_verification_status: state.phoneVerificationStatus,
        provider: state.provider ?? state.authProvider ?? null,
        auth_provider: state.authProvider,
        temperature: 50,
      },
    });
    const rotateSession = request.nextUrl.searchParams.get("rotate_session") === "1";
    const sessionMeta = buildRequestSessionMeta(request);
    try {
      await syncActiveSessionForUser(user.id, response, {
        rotate: rotateSession,
        sessionMeta,
        loginIdentifier: state.authLoginEmail ?? state.email ?? null,
      });
    } catch {
      // Profile ensure is the primary responsibility here.
      // Session registry/cookie sync failures are handled by follow-up session checks and should not return 500.
    }
    return response;
  } catch (error) {
    return jsonError(safeErrorMessage(error, "프로필 동기화에 실패했습니다."), 500, {
      code: "profile_ensure_failed",
    });
  }
}
