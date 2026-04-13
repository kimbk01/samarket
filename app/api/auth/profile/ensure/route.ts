import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { ensureAuthProfileRow } from "@/lib/auth/member-access";
import { jsonError, jsonOk, safeErrorMessage } from "@/lib/http/api-route";
import { enforceProfileEnsureQuota } from "@/lib/security/rate-limit-presets";

export const dynamic = "force-dynamic";

export async function POST() {
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
    return jsonOk({
      profile: {
        id: state.userId,
        email: state.email ?? "",
        nickname: state.nickname,
        avatar_url: state.avatarUrl,
        username: state.username,
        role: state.role,
        member_type: state.memberType,
        phone: state.phone,
        phone_verified: state.phoneVerified,
        phone_verification_status: state.phoneVerificationStatus,
        temperature: 50,
      },
    });
  } catch (error) {
    return jsonError(safeErrorMessage(error, "프로필 동기화에 실패했습니다."), 500, {
      code: "profile_ensure_failed",
    });
  }
}
