import type { Profile } from "@/lib/types/profile";
import { normalizeProfilePublicIdFields } from "@/lib/auth/dibay-public-id-ssot";
import {
  deriveDibaySignupStatus,
  isDibaySignupGateExcludedPath,
  type DibaySignupProfileInput,
} from "@/lib/auth/dibay-signup-status";
import { getClientRequiredConsentVersions } from "@/lib/legal/client-required-consent";

/** Profile 캐시 → deriveDibaySignupStatus 입력 (누락 필드는 false 쪽으로 수렴) */
export function profileToDibaySignupInput(user: Profile): DibaySignupProfileInput {
  return {
    id: user.id,
    ...normalizeProfilePublicIdFields({
      dibay_id: user.dibay_id ?? null,
      dibay_id_locked: user.dibay_id_locked ?? null,
      username: user.username ?? null,
      username_confirmed: user.username_confirmed ?? null,
    }),
    display_name: user.display_name ?? user.nickname ?? null,
    avatar_url: user.avatar_url ?? null,
    terms_accepted_at: user.terms_accepted_at ?? null,
    terms_version: user.terms_version ?? null,
    privacy_accepted_at: user.privacy_accepted_at ?? null,
    privacy_version: user.privacy_version ?? null,
    onboarding_completed_at: user.onboarding_completed_at ?? null,
    onboarding_status: user.onboarding_status ?? null,
    role: user.role ?? null,
  };
}

/** 클라이언트 접근 게이트: 로그인 + 약관 동의. @id·프로필·전화·주소는 requireAuthAction / requireProfileCompletion. */
export function isClientSignupComplete(user: Profile | null | undefined): boolean {
  if (!user?.id) return false;
  return deriveDibaySignupStatus(profileToDibaySignupInput(user), {
    hasSession: true,
    requiredConsent: getClientRequiredConsentVersions(),
  }).consentComplete;
}

/**
 * P2-1 (SG-05): 클라이언트 동의 게이트 제외 경로 — 로그인·인증·온보딩·법적 고지·고객센터.
 * 그 외 경로(public browse 포함)는 로그인 + 미동의 회원이면 동의 화면으로 보낸다. 게스트는 대상 아님.
 */
export function isClientSignupGateExemptPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim() || "";
  if (!p) return true;
  if (isDibaySignupGateExcludedPath(p)) return true;
  const prefixes = ["/auth", "/login", "/signup", "/onboarding", "/terms", "/privacy", "/legal", "/support"];
  return prefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}
