/**
 * 중앙 쓰기 게이트 — 가입(전화 인증 + 대표 주소) 판정 (동의는 앞단 `resolveMemberConsentAuthority` 가 이미 통과).
 * 입력은 쓰기 검사 스냅샷(`member_write_gate_snapshot` 1회)의 `registration` — 없을 때(구 DB 함수)만 직접 2회 조회.
 * Fail-closed: 조회 실패는 UNAVAILABLE — 「가입 완료」로 간주하지 않는다.
 */
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export type MemberRegistrationAuthorityResult =
  | { kind: "REGISTERED" }
  | { kind: "REGISTRATION_REQUIRED"; step: "phone" | "address" }
  | { kind: "UNAVAILABLE" };

export function judgeMemberRegistration(facts: {
  phoneVerified: boolean;
  hasDefaultMaster: boolean;
}): MemberRegistrationAuthorityResult {
  if (!facts.phoneVerified) return { kind: "REGISTRATION_REQUIRED", step: "phone" };
  if (!facts.hasDefaultMaster) return { kind: "REGISTRATION_REQUIRED", step: "address" };
  return { kind: "REGISTERED" };
}

export async function resolveMemberRegistrationAuthority(
  userId: string,
  preloaded?: { phoneVerified: boolean; hasDefaultMaster: boolean } | null,
): Promise<MemberRegistrationAuthorityResult> {
  if (preloaded) return judgeMemberRegistration(preloaded);
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return { kind: "UNAVAILABLE" };
  try {
    // proxy 번들에 주소 서비스 모듈을 끌어오지 않도록 같은 조건(active AND is_default_master)을 여기서 직접 읽는다.
    const [profileRes, addressRes] = await Promise.all([
      sb
        .from("profiles")
        .select("phone_verified,phone_verified_at,phone_verification_method,role,provider,auth_provider,email")
        .eq("id", userId)
        .maybeSingle(),
      sb
        .from("user_addresses")
        .select("id")
        .eq("user_id", userId)
        .eq("is_active", true)
        .eq("is_default_master", true)
        .limit(1),
    ]);
    if (profileRes.error || !profileRes.data || addressRes.error) return { kind: "UNAVAILABLE" };
    const hasDefaultMaster = Array.isArray(addressRes.data) && addressRes.data.length > 0;
    const row = profileRes.data as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === "string" ? v : null);
    return judgeMemberRegistration({
      phoneVerified: hasVerifiedPhone({
        phone_verified: row.phone_verified === true,
        phone_verified_at: s(row.phone_verified_at),
        phone_verification_method: s(row.phone_verification_method),
        role: s(row.role),
        provider: s(row.provider),
        auth_provider: s(row.auth_provider),
        email: s(row.email),
      }),
      hasDefaultMaster,
    });
  } catch {
    return { kind: "UNAVAILABLE" };
  }
}
