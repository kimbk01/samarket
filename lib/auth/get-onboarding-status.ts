import type { SupabaseClient } from "@supabase/supabase-js";
import { isMandatoryAddressGateSatisfied } from "@/lib/addresses/user-address-service";
import {
  hasPhilippinePhoneVerification,
  hasStoreTermsConsent,
} from "@/lib/auth/store-member-policy";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";

/**
 * SAMarket 사용자 온보딩 상태 — 콜백·게이트·라우팅 분기에 공통으로 사용한다.
 *
 * - `profileExists`: profiles 행이 보장됨(`ensureAuthProfileRow` 직후 항상 true)
 * - `nicknameComplete`: profiles.nickname 이 비어있지 않음
 * - `consentComplete`: 이용약관·개인정보 동의가 최신 버전으로 기록됨
 * - `addressComplete`: 대표 주소(`is_default_master`)가 1건 이상 존재
 * - `phoneVerified`: 전화번호 인증 완료(필리핀 정회원 기준)
 * - `profileComplete`: profile + nickname + consent 모두 충족 — onboarding/profile 단계 통과 여부
 *
 * 글쓰기·채팅·거래·주문 등 핵심 액션은 `phoneVerified` 가 true 여야 한다 (스펙 1-D).
 */
export type OnboardingStatus = {
  profileExists: boolean;
  nicknameComplete: boolean;
  consentComplete: boolean;
  addressComplete: boolean;
  phoneVerified: boolean;
  profileComplete: boolean;
  isPrivilegedAdmin: boolean;
};

type ProfileRowSubset = {
  id: string | null;
  nickname: string | null;
  email: string | null;
  role: string | null;
  phone_verified: boolean | null;
  phone_verified_at: string | null;
  provider: string | null;
  auth_provider: string | null;
  terms_accepted_at: string | null;
  terms_version: string | null;
  privacy_accepted_at: string | null;
  privacy_version: string | null;
};

function pickTrimmedString(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function loadProfileSubset(
  sb: SupabaseClient,
  userId: string
): Promise<ProfileRowSubset | null> {
  const { data, error } = await sb
    .from("profiles")
    .select(
      "id,nickname,email,role,phone_verified,phone_verified_at,provider,auth_provider,terms_accepted_at,terms_version,privacy_accepted_at,privacy_version"
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: pickTrimmedString(row.id),
    nickname: pickTrimmedString(row.nickname),
    email: pickTrimmedString(row.email),
    role: pickTrimmedString(row.role),
    phone_verified: row.phone_verified === true,
    phone_verified_at: pickTrimmedString(row.phone_verified_at),
    provider: pickTrimmedString(row.provider),
    auth_provider: pickTrimmedString(row.auth_provider),
    terms_accepted_at: pickTrimmedString(row.terms_accepted_at),
    terms_version: pickTrimmedString(row.terms_version),
    privacy_accepted_at: pickTrimmedString(row.privacy_accepted_at),
    privacy_version: pickTrimmedString(row.privacy_version),
  };
}

/**
 * 사용자 ID 로 온보딩 상태를 조회한다 (DB 1~2회 조회).
 * - 호출 측은 `tryGetSupabaseForStores`(서비스 키) 또는 RLS 통과한 클라이언트를 넘긴다.
 */
export async function getOnboardingStatus(
  sb: SupabaseClient,
  userId: string
): Promise<OnboardingStatus> {
  const profile = await loadProfileSubset(sb, userId);
  const profileExists = profile?.id !== null && profile?.id !== undefined;
  const nicknameComplete = Boolean(profile?.nickname && profile.nickname.length > 0);
  const consentComplete = hasStoreTermsConsent({
    terms_accepted_at: profile?.terms_accepted_at ?? null,
    terms_version: profile?.terms_version ?? null,
    privacy_accepted_at: profile?.privacy_accepted_at ?? null,
    privacy_version: profile?.privacy_version ?? null,
  });
  const isPrivilegedAdmin = isPrivilegedAdminRole(profile?.role ?? null);
  const phoneVerified = hasPhilippinePhoneVerification({
    role: profile?.role ?? null,
    phone_verified: profile?.phone_verified ?? false,
    phone_verified_at: profile?.phone_verified_at ?? null,
    provider: profile?.provider ?? profile?.auth_provider ?? null,
    auth_provider: profile?.auth_provider ?? null,
    email: profile?.email ?? null,
  });

  let addressComplete = false;
  try {
    addressComplete = await isMandatoryAddressGateSatisfied(sb, userId);
  } catch {
    addressComplete = false;
  }

  const profileComplete = profileExists && nicknameComplete && consentComplete;

  return {
    profileExists,
    nicknameComplete,
    consentComplete,
    addressComplete,
    phoneVerified,
    profileComplete,
    isPrivilegedAdmin,
  };
}
