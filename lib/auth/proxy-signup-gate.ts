import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveDibaySignupStatus,
  isDibaySignupComplete,
  isDibaySignupGateExcludedPath,
  resolveDibaySignupRoute,
} from "@/lib/auth/dibay-signup-status";
import { shouldBlockUnauthenticatedHtmlRequest } from "@/lib/auth/guest-browse-access-policy";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { resolveRequiredConsentVersions } from "@/lib/legal/resolve-required-consent-versions";
import { hasActiveAdminMembershipOrLegacyRole } from "@/lib/admin/admin-membership";
import type { DibayMemberClaim } from "@/lib/auth/member-token-claims";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { nextRegistrationStep, registrationStepHref } from "@/lib/auth/dibay-registration-steps";
import { isRegistrationGateExemptPath } from "@/lib/auth/registration-gate";
import { resolveMemberRegistrationAuthority } from "@/lib/auth/resolve-member-registration-authority";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";

const SIGNUP_GATE_PROFILE_SELECT =
  "id, dibay_id, dibay_id_locked, username, username_confirmed, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version, onboarding_completed_at, onboarding_status, role";

function normalizeGatePathname(pathname: string): string {
  return (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
}

/**
 * 가입 단계(전화·주소) — 동의 완료 뒤 두 번째 단계 (가입 SSOT 2026-11-24 S2, `registration-gate` 와 같은 목적지·예외).
 * - 토큰 클레임에 가입 재료가 있고 「완료」면 DB 0회.
 * - 클레임이 「미완료」면 DB 로 확인(클레임이 옛 값이거나 관리자 면제일 수 있음) — `resolveMemberRegistrationAuthority`.
 * - 클레임에 재료가 없으면(훅 적용 전 토큰) 판정하지 않는다 → 화면 관문이 처리(요청 증가 없음).
 * - 조회 실패는 통과(fail-open — proxy 는 화면 이동만, 쓰기는 서버 쓰기 관문이 막는다).
 */
async function resolveProxyRegistrationRedirect(
  claim: DibayMemberClaim | null,
  userId: string,
  pathname: string,
): Promise<string | null> {
  if (isRegistrationGateExemptPath(pathname)) return null;
  const reg = claim?.registration;
  if (!reg) return null;
  const isPrivilegedAdmin = isPrivilegedAdminRole(reg.admin_role);
  const stepFromClaim = nextRegistrationStep({
    consentComplete: true,
    isPrivilegedAdmin,
    phoneVerified: hasVerifiedPhone({
      privilegedAdmin: isPrivilegedAdmin,
      phone_verified: reg.phone_verified,
      phone_verified_at: reg.phone_verified_at,
      phone_verification_method: reg.phone_verification_method,
      provider: reg.provider,
      auth_provider: reg.auth_provider,
      email: reg.email,
      role: reg.role,
      has_phone: reg.has_phone,
    }),
    addressComplete: reg.has_default_master,
  });
  if (!stepFromClaim) return null;
  const authority = await resolveMemberRegistrationAuthority(userId).catch(() => null);
  if (!authority || authority.kind !== "REGISTRATION_REQUIRED") return null;
  return registrationStepHref(authority.step, sanitizeNextPath(pathname));
}

/**
 * 인증 쿠키는 있으나 가입 미완료 사용자가 private HTML 경로에 접근할 때 온보딩으로 보낸다.
 * 공개 browse·인증 플로우·프로필 setup 경로는 제외한다.
 */
export async function resolveProxySignupGateRedirect(
  sb: SupabaseClient,
  userId: string,
  pathname: string,
  opts?: {
    /** D5 — 검증된 토큰 클레임(약관 4필드). 같은 판정 함수로 「완료」면 profiles 를 읽지 않는다. 미완료·없음 → DB. */
    loadVerifiedClaim?: () => Promise<DibayMemberClaim | null>;
  }
): Promise<string | null> {
  if (isDibaySignupGateExcludedPath(pathname)) return null;
  if (!shouldBlockUnauthenticatedHtmlRequest(pathname)) return null;

  let claim: DibayMemberClaim | null = null;
  if (opts?.loadVerifiedClaim) {
    claim = await opts.loadVerifiedClaim().catch(() => null);
    if (claim) {
      const requiredFromClaim = await resolveRequiredConsentVersions();
      const fromClaim = deriveDibaySignupStatus(
        {
          id: userId,
          terms_accepted_at: claim.terms_accepted_at,
          terms_version: claim.terms_version,
          privacy_accepted_at: claim.privacy_accepted_at,
          privacy_version: claim.privacy_version,
        },
        { hasSession: true, requiredConsent: requiredFromClaim }
      );
      if (isDibaySignupComplete(fromClaim)) return resolveProxyRegistrationRedirect(claim, userId, pathname);
    }
  }

  const { data, error } = await sb
    .from("profiles")
    .select(SIGNUP_GATE_PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;

  const required = await resolveRequiredConsentVersions();
  let signup = deriveDibaySignupStatus(data, { hasSession: true, requiredConsent: required });
  if (isDibaySignupComplete(signup)) return resolveProxyRegistrationRedirect(claim, userId, pathname);

  // P2-3: 미완료일 때만 membership verdict 확인 (완료 회원 hot path 비용 0) —
  // getOnboardingStatus / resolveMemberConsentAuthority 와 같은 관리자 판정.
  const privilegedAdmin = await hasActiveAdminMembershipOrLegacyRole(sb, userId).catch(() => false);
  if (privilegedAdmin) {
    signup = deriveDibaySignupStatus(data, { hasSession: true, privilegedAdmin, requiredConsent: required });
    /** 특권 관리자 — 가입 단계(전화·주소)도 면제 */
    if (isDibaySignupComplete(signup)) return null;
  }

  const redirectPath = resolveDibaySignupRoute(signup, sanitizeNextPath(pathname));
  const targetPathname = normalizeGatePathname(redirectPath);
  const currentPathname = normalizeGatePathname(pathname);
  if (targetPathname === currentPathname) return null;

  return redirectPath;
}
