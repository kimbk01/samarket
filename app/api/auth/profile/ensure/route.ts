import { NextRequest } from "next/server";
import { buildRequestSessionMeta } from "@/lib/auth/request-device-info";
import { syncActiveSessionForUser } from "@/lib/auth/server-guards";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { ensureAuthProfileRow } from "@/lib/auth/member-access";
import { ensureProfileForUserId } from "@/lib/profile/ensure-profile-for-user-id";
import { withDefaultAvatar } from "@/lib/profile/default-avatar";
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

  /**
   * service_role 이 있으면 트리거·제약을 안정적으로 통과하고,
   * 없으면 본인 쿠키 클라이언트의 INSERT-only fallback 으로 최소 프로필 행을 보장한다.
   */
  const serviceSb = tryCreateSupabaseServiceClient();
  const writeSb = serviceSb ?? routeSb;

  try {
    const state = await ensureAuthProfileRow(writeSb, user).catch(async () => {
      const fallback = serviceSb ? await ensureProfileForUserId(serviceSb, user.id) : null;
      if (!fallback) throw new Error("profile_ensure_failed");
      const row = fallback as {
        id: string;
        email?: string | null;
        username?: string | null;
        nickname?: string | null;
        avatar_url?: string | null;
        role?: string | null;
        member_type?: string | null;
        status?: string | null;
        phone?: string | null;
        phone_country_code?: string | null;
        phone_number?: string | null;
        phone_verified?: boolean | null;
        phone_verified_at?: string | null;
        phone_verification_status?: string | null;
        auth_login_email?: string | null;
        auth_provider?: string | null;
        provider?: string | null;
      };
      return {
        userId: row.id,
        email: row.email ?? null,
        username: row.username ?? null,
        nickname: row.nickname ?? "user",
        avatarUrl: withDefaultAvatar(row.avatar_url ?? null),
        role: row.role ?? "user",
        memberType: row.member_type ?? "normal",
        status: row.status ?? "sns_pending",
        phone: row.phone ?? null,
        phoneCountryCode: row.phone_country_code ?? "+63",
        phoneNumber: row.phone_number ?? null,
        phoneVerified: row.phone_verified === true,
        phoneVerifiedAt: row.phone_verified_at ?? null,
        phoneVerificationStatus: row.phone_verification_status ?? "unverified",
        authLoginEmail: row.auth_login_email ?? row.email ?? null,
        authProvider: row.auth_provider ?? null,
        provider: row.provider ?? null,
      };
    });
    const response = jsonOk({
      profile: {
        id: state.userId,
        email: state.email ?? "",
        display_name: state.nickname,
        nickname: state.nickname,
        avatar_url: withDefaultAvatar(state.avatarUrl),
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
