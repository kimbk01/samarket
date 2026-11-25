import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRow } from "@/lib/profile/types";
import { profileRowFromSelectFull } from "@/lib/profile/fetch-profile-row-safe";
import type { AdminMembershipRow } from "@/lib/admin/admin-membership";

/**
 * 관리자 API 인증 확인 1회 조회 — DB 함수 `admin_api_actor_context` (Auth HARD LOCK Amendment 2026-11-25).
 *
 * 예전: 요청마다 profiles · user_sessions · admin_memberships 를 따로 3번 왕복.
 * 이제: 같은 세 행을 한 번에 읽는다. **판정은 하지 않는다** — 호출자(`requireAdminApiUser`)가 기존 TS 판정을 그대로 한다.
 *
 * 반환 null = 이 경로로 판단할 수 없음(함수 없음·오류·형식 이상) → 호출자는 기존 3단계 경로로 간다.
 */
export const ADMIN_API_ACTOR_CONTEXT_RPC = "admin_api_actor_context";

export type AdminApiActorContext = {
  /** 행 없음 = null (기존 경로가 프로필 생성·404 를 처리) */
  profile: ProfileRow | null;
  /** 세션 등록 행이 있고 active=true 면 true. 행 없음·비활성 = false (기존 경로가 등록 보완·401 을 처리) */
  sessionActive: boolean;
  /** 활성 membership 행 (role 판정 전). 없음 = null */
  membership: AdminMembershipRow | null;
};

let warnedUnavailable = false;

export async function loadAdminApiActorContext(
  sb: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<AdminApiActorContext | null> {
  const uid = String(userId ?? "").trim();
  const sid = String(sessionId ?? "").trim();
  if (!uid || !sid) return null;
  let data: unknown;
  try {
    const res = await sb.rpc(ADMIN_API_ACTOR_CONTEXT_RPC, { p_user_id: uid, p_session_id: sid });
    if (res.error) {
      if (!warnedUnavailable) {
        warnedUnavailable = true;
        console.warn("[admin-api-actor-context] rpc_unavailable — 기존 3단계 조회로", res.error.message);
      }
      return null;
    }
    data = res.data;
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const row = data as { profile?: unknown; session?: unknown; membership?: unknown };

  const profileRaw = row.profile;
  const profile =
    profileRaw && typeof profileRaw === "object" && !Array.isArray(profileRaw)
      ? profileRowFromSelectFull(uid, profileRaw as Record<string, unknown>)
      : null;

  const sessionRaw = row.session as { active?: unknown } | null | undefined;
  const sessionActive = !!sessionRaw && typeof sessionRaw === "object" && sessionRaw.active === true;

  const membershipRaw = row.membership;
  const membership =
    membershipRaw && typeof membershipRaw === "object" && !Array.isArray(membershipRaw)
      ? (membershipRaw as AdminMembershipRow)
      : null;

  return { profile, sessionActive, membership };
}
