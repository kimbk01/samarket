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
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";

export type MemberWriteGateSnapshot = {
  lifecycle: MemberLifecycleAuthorityResult;
  /** lifecycle 이 RESOLVED 일 때만 — 동의 판정 입력 */
  consent: MemberConsentPreloaded | null;
  /**
   * 가입(전화 인증 + 대표 주소) 판정 입력 — DB 함수에 필드가 없으면(구 정의) null → 호출자가 직접 조회.
   * 전화 = `hasVerifiedPhone`(관리자 생성 계정 인정) · 주소 = active AND is_default_master.
   */
  registration?: { phoneVerified: boolean; hasDefaultMaster: boolean } | null;
};

type SnapshotJson = {
  found?: unknown;
  status?: unknown;
  deleted_at?: unknown;
  terms_accepted_at?: unknown;
  terms_version?: unknown;
  privacy_accepted_at?: unknown;
  privacy_version?: unknown;
  date_of_birth?: unknown;
  age_gate_status?: unknown;
  age_attested_at?: unknown;
  age_gate_legacy?: unknown;
  role?: unknown;
  admin_role?: unknown;
  phone_verified?: unknown;
  phone_verified_at?: unknown;
  phone_verification_method?: unknown;
  provider?: unknown;
  auth_provider?: unknown;
  email?: unknown;
  has_default_master?: unknown;
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
  const lifecycle: MemberLifecycleAuthorityResult = {
    kind: "RESOLVED",
    profile,
    lifecycle: resolveMemberAccountLifecycle(profile),
    source: "db",
  };
  const registration =
    typeof json.has_default_master === "boolean"
      ? {
          phoneVerified: hasVerifiedPhone({
            phone_verified: json.phone_verified === true,
            phone_verified_at: str(json.phone_verified_at),
            phone_verification_method: str(json.phone_verification_method),
            role: str(json.role),
            provider: str(json.provider),
            auth_provider: str(json.auth_provider),
            email: str(json.email),
          }),
          hasDefaultMaster: json.has_default_master,
        }
      : null;
  // Snapshot without the pre-policy flag cannot decide the age gate — consent falls back to direct reads.
  if (typeof json.age_gate_legacy !== "boolean") return { lifecycle, consent: null, registration };
  return {
    lifecycle,
    registration,
    consent: {
      row: {
        terms_accepted_at: str(json.terms_accepted_at),
        terms_version: str(json.terms_version),
        privacy_accepted_at: str(json.privacy_accepted_at),
        privacy_version: str(json.privacy_version),
        date_of_birth: str(json.date_of_birth),
        age_gate_status: str(json.age_gate_status),
        age_attested_at: str(json.age_attested_at),
        age_gate_legacy: json.age_gate_legacy,
        role: str(json.role),
      },
      adminRole: str(json.admin_role),
    },
  };
}
