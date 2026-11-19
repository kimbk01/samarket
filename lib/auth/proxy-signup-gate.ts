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

const SIGNUP_GATE_PROFILE_SELECT =
  "id, dibay_id, dibay_id_locked, username, username_confirmed, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version, onboarding_completed_at, onboarding_status, role";

function normalizeGatePathname(pathname: string): string {
  return (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
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

  if (opts?.loadVerifiedClaim) {
    const claim = await opts.loadVerifiedClaim().catch(() => null);
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
      if (isDibaySignupComplete(fromClaim)) return null;
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
  if (isDibaySignupComplete(signup)) return null;

  // P2-3: 미완료일 때만 membership verdict 확인 (완료 회원 hot path 비용 0) —
  // getOnboardingStatus / resolveMemberConsentAuthority 와 같은 관리자 판정.
  const privilegedAdmin = await hasActiveAdminMembershipOrLegacyRole(sb, userId).catch(() => false);
  if (privilegedAdmin) {
    signup = deriveDibaySignupStatus(data, { hasSession: true, privilegedAdmin, requiredConsent: required });
    if (isDibaySignupComplete(signup)) return null;
  }

  const redirectPath = resolveDibaySignupRoute(signup, sanitizeNextPath(pathname));
  const targetPathname = normalizeGatePathname(redirectPath);
  const currentPathname = normalizeGatePathname(pathname);
  if (targetPathname === currentPathname) return null;

  return redirectPath;
}
