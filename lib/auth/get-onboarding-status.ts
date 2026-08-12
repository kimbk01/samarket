import type { SupabaseClient } from "@supabase/supabase-js";
import { hasCanonicalDefaultMasterAddress } from "@/lib/addresses/user-address-service";
import { hasStoreTermsConsent } from "@/lib/auth/store-member-policy";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { hasActiveAdminMembershipOrLegacyRole } from "@/lib/admin/admin-membership";
import {
  deriveDibaySignupStatus,
  isDibayIdComplete,
  isDibayProfileComplete,
} from "@/lib/auth/dibay-signup-status";
import type { DibayOnboardingStatusValue } from "@/lib/auth/dibay-signup-status";
import { resolveRequiredConsentVersions } from "@/lib/legal/resolve-required-consent-versions";

/**
 * SAMarket 사용자 온보딩 상태 — 콜백·게이트·라우팅 분기에 공통으로 사용한다.
 *
 * 가입 완료( signup ): 약관·개인정보 동의만 (법적 최소)
 * @id·프로필·주소·전화: 기능별 requireProfileCompletion gate
 */
export type OnboardingStatus = {
  profileExists: boolean;
  usernameComplete: boolean;
  dibayIdComplete: boolean;
  nicknameComplete: boolean;
  consentComplete: boolean;
  addressComplete: boolean;
  phoneVerified: boolean;
  profileComplete: boolean;
  signupComplete: boolean;
  isPrivilegedAdmin: boolean;
  dibayId: string | null;
  dibayIdLocked: boolean;
  username: string | null;
  usernameConfirmed: boolean;
  termsAcceptedAt: string | null;
  termsVersion: string | null;
  privacyAcceptedAt: string | null;
  privacyVersion: string | null;
  onboardingCompletedAt: string | null;
  onboardingStatus: DibayOnboardingStatusValue | null;
  displayName: string | null;
  avatarUrl: string | null;
};

type ProfileRowSubset = {
  id: string | null;
  username: string | null;
  username_confirmed: boolean | null;
  dibay_id: string | null;
  dibay_id_locked: boolean | null;
  display_name?: string | null;
  avatar_url?: string | null;
  nickname: string | null;
  email: string | null;
  role: string | null;
  phone_verified: boolean | null;
  phone_verified_at: string | null;
  phone_verification_method: string | null;
  provider: string | null;
  auth_provider: string | null;
  terms_accepted_at: string | null;
  terms_version: string | null;
  privacy_accepted_at: string | null;
  privacy_version: string | null;
  onboarding_completed_at: string | null;
  onboarding_status: string | null;
};

const ADDRESS_STATUS_TIMEOUT_MS = 900;

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
      "id,username,username_confirmed,dibay_id,dibay_id_locked,display_name,avatar_url,nickname,email,role,phone_verified,phone_verified_at,phone_verification_method,provider,auth_provider,terms_accepted_at,terms_version,privacy_accepted_at,privacy_version,onboarding_completed_at,onboarding_status"
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: pickTrimmedString(row.id),
    username: pickTrimmedString(row.username),
    username_confirmed: row.username_confirmed === true,
    dibay_id: pickTrimmedString(row.dibay_id),
    dibay_id_locked: row.dibay_id_locked === true,
    display_name: pickTrimmedString(row.display_name),
    avatar_url: pickTrimmedString(row.avatar_url),
    nickname: pickTrimmedString(row.nickname),
    email: pickTrimmedString(row.email),
    role: pickTrimmedString(row.role),
    phone_verified: row.phone_verified === true,
    phone_verified_at: pickTrimmedString(row.phone_verified_at),
    phone_verification_method: pickTrimmedString(row.phone_verification_method),
    provider: pickTrimmedString(row.provider),
    auth_provider: pickTrimmedString(row.auth_provider),
    terms_accepted_at: pickTrimmedString(row.terms_accepted_at),
    terms_version: pickTrimmedString(row.terms_version),
    privacy_accepted_at: pickTrimmedString(row.privacy_accepted_at),
    privacy_version: pickTrimmedString(row.privacy_version),
    onboarding_completed_at: pickTrimmedString(row.onboarding_completed_at),
    onboarding_status: pickTrimmedString(row.onboarding_status),
  };
}

/**
 * 사용자 ID 로 온보딩 상태를 조회한다 (DB 1~2회 조회).
 */
export async function getOnboardingStatus(
  sb: SupabaseClient,
  userId: string
): Promise<OnboardingStatus> {
  const [profileSettled, addressSettled] = await Promise.allSettled([
    loadProfileSubset(sb, userId),
    Promise.race([
      hasCanonicalDefaultMasterAddress(sb, userId),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ADDRESS_STATUS_TIMEOUT_MS)),
    ]),
  ]);
  const profile = profileSettled.status === "fulfilled" ? profileSettled.value : null;
  const profileExists = profile?.id !== null && profile?.id !== undefined;
  const required = await resolveRequiredConsentVersions();
  const consentComplete = hasStoreTermsConsent(
    {
      terms_accepted_at: profile?.terms_accepted_at ?? null,
      terms_version: profile?.terms_version ?? null,
      privacy_accepted_at: profile?.privacy_accepted_at ?? null,
      privacy_version: profile?.privacy_version ?? null,
    },
    required,
  );
  const dibayIdComplete = isDibayIdComplete(profile ?? undefined);
  const usernameComplete = dibayIdComplete;
  const nicknameComplete = Boolean(
    (profile?.display_name && profile.display_name.length > 0) ||
      (profile?.nickname && profile.nickname.length > 0)
  );
  const isPrivilegedAdmin = profileExists
    ? await hasActiveAdminMembershipOrLegacyRole(sb, userId, profile?.role ?? null).catch(() => false)
    : false;
  const phoneVerified =
    isPrivilegedAdmin ||
    hasVerifiedPhone({
      role: profile?.role ?? null,
      privilegedAdmin: isPrivilegedAdmin,
      phone_verified: profile?.phone_verified ?? false,
      phone_verified_at: profile?.phone_verified_at ?? null,
      phone_verification_method: profile?.phone_verification_method ?? null,
      provider: profile?.provider ?? profile?.auth_provider ?? null,
      auth_provider: profile?.auth_provider ?? null,
      email: profile?.email ?? null,
    });

  const addressComplete = addressSettled.status === "fulfilled" ? addressSettled.value : false;

  const signup = deriveDibaySignupStatus(profile ?? undefined, {
    hasSession: profileExists,
    privilegedAdmin: isPrivilegedAdmin,
    requiredConsent: required,
  });

  return {
    profileExists,
    usernameComplete,
    dibayIdComplete,
    nicknameComplete,
    consentComplete,
    addressComplete,
    phoneVerified,
    profileComplete: profileExists && isDibayProfileComplete(profile ?? undefined),
    signupComplete: signup.signupComplete,
    isPrivilegedAdmin,
    dibayId: profile?.dibay_id ?? null,
    dibayIdLocked: profile?.dibay_id_locked === true,
    username: profile?.username ?? null,
    usernameConfirmed: profile?.username_confirmed === true,
    termsAcceptedAt: profile?.terms_accepted_at ?? null,
    termsVersion: profile?.terms_version ?? null,
    privacyAcceptedAt: profile?.privacy_accepted_at ?? null,
    privacyVersion: profile?.privacy_version ?? null,
    onboardingCompletedAt: profile?.onboarding_completed_at ?? null,
    onboardingStatus: signup.onboardingStatus,
    displayName: profile?.display_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
  };
}
