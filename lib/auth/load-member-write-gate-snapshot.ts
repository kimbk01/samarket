/**
 * 회원 쓰기 검사(proxy PRODUCT_WRITE) 1회 조회 — 요청 증폭 근본 수정 2단계 2-A.
 * 회원 상태 + 약관 동의 행 + 활성 관리자 역할을 DB 함수 `member_write_gate_snapshot` 1회로 읽는다.
 * 판정(lifecycle 분류·동의 버전 비교·관리자 역할)은 기존 TS 함수가 그대로 한다.
 * 캐시 없음 (P0-R3) — 읽은 상태는 기존과 같이 lifecycle 캐시에 기록만 한다 (GET 읽기 경로용).
 */
import { setMemberLifecycleAuthority } from "@/lib/auth/member-lifecycle-authority-cache";
import { resolveMemberAccountLifecycle } from "@/lib/auth/member-account-state";
import type { MemberLifecycleAuthorityResult } from "@/lib/auth/resolve-member-lifecycle-authority";
import type { MemberConsentPreloaded } from "@/lib/auth/resolve-member-consent-authority";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export type MemberWriteGateSnapshot = {
  lifecycle: MemberLifecycleAuthorityResult;
  /** lifecycle 이 RESOLVED 일 때만 — 동의 판정 입력 */
  consent: MemberConsentPreloaded | null;
};

type SnapshotJson = {
  found?: unknown;
  status?: unknown;
  deleted_at?: unknown;
  terms_accepted_at?: unknown;
  terms_version?: unknown;
  privacy_accepted_at?: unknown;
  privacy_version?: unknown;
  role?: unknown;
  admin_role?: unknown;
};

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** service client 가 없으면 null — 호출자는 기존 개별 조회 경로를 쓴다. */
export async function loadMemberWriteGateSnapshot(userId: string): Promise<MemberWriteGateSnapshot | null> {
  const uid = userId.trim();
  if (!uid) {
    return { lifecycle: { kind: "AUTHORITY_UNAVAILABLE", reason: "empty_user_id" }, consent: null };
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return null;

  let json: SnapshotJson | null = null;
  try {
    const { data, error } = await sb.rpc("member_write_gate_snapshot", { p_user_id: uid });
    if (error) {
      return { lifecycle: { kind: "AUTHORITY_UNAVAILABLE", reason: "query_error" }, consent: null };
    }
    json = data && typeof data === "object" && !Array.isArray(data) ? (data as SnapshotJson) : null;
  } catch {
    return { lifecycle: { kind: "AUTHORITY_UNAVAILABLE", reason: "query_error" }, consent: null };
  }
  if (!json || typeof json.found !== "boolean") {
    return { lifecycle: { kind: "AUTHORITY_UNAVAILABLE", reason: "malformed_row" }, consent: null };
  }
  if (!json.found) return { lifecycle: { kind: "PROFILE_NOT_FOUND" }, consent: null };

  const profile = { status: str(json.status), deleted_at: str(json.deleted_at) };
  setMemberLifecycleAuthority(uid, profile);
  return {
    lifecycle: {
      kind: "RESOLVED",
      profile,
      lifecycle: resolveMemberAccountLifecycle(profile),
      source: "db",
    },
    consent: {
      row: {
        terms_accepted_at: str(json.terms_accepted_at),
        terms_version: str(json.terms_version),
        privacy_accepted_at: str(json.privacy_accepted_at),
        privacy_version: str(json.privacy_version),
        role: str(json.role),
      },
      adminRole: str(json.admin_role),
    },
  };
}
