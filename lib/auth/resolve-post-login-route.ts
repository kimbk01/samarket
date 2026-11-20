import type { OnboardingStatus } from "@/lib/auth/get-onboarding-status";
import {
  deriveDibaySignupStatus,
  resolveDibaySignupRoute,
} from "@/lib/auth/dibay-signup-status";
import { sanitizeFreshLoginLandingPath, sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { registrationStepHref } from "@/lib/auth/dibay-registration-steps";

/**
 * 로그인 콜백·세션 복원·온보딩 화면 종료 시 다음 라우트를 결정한다.
 *
 * 1) 약관 미동의 → 동의 화면 (기존 계약 그대로).
 * 2) 동의 완료 + 가입 미완료(전화 인증·대표 주소) → 빠진 가입 단계 화면 (Owner 2026-11-20 「승인, 구현 진행」).
 *    단계 화면에는 [나중에 하기]가 있어 열람은 막지 않는다.
 * 3) 가입 완료 → next / 기본 랜딩.
 * @see lib/auth/dibay-registration-steps.ts
 */
export type ResolvePostLoginRouteParams = {
  hasSession: boolean;
  status: OnboardingStatus | null;
  next?: string | null;
  /**
   * 화면 안 이동(로그인 직후가 아님) — 동의 화면 저장 뒤·가입 단계 완료 뒤 등.
   * true 면 `next` 의 계정 묶인 화면(채팅방·주문 등)을 지우지 않고 그대로 돌아간다(재감사 M1).
   * 로그인 직후 목적지(콜백·네이티브·QR·아이디 로그인)는 false — 다른 계정 바로가기 복원 금지 그대로.
   */
  inSession?: boolean;
};

function onboardingStatusToDibaySignup(status: OnboardingStatus) {
  return deriveDibaySignupStatus(
    {
      id: status.profileExists ? "user" : null,
      dibay_id: status.dibayId,
      dibay_id_locked: status.dibayIdLocked,
      username: status.username,
      username_confirmed: status.usernameConfirmed,
      display_name: status.displayName,
      avatar_url: status.avatarUrl,
      terms_accepted_at: status.termsAcceptedAt,
      terms_version: status.termsVersion,
      privacy_accepted_at: status.privacyAcceptedAt,
      privacy_version: status.privacyVersion,
      onboarding_completed_at: status.onboardingCompletedAt,
      onboarding_status: status.onboardingStatus,
      role: status.isPrivilegedAdmin ? "admin" : "user",
    },
    // B11: judge against the same CMS versions getOnboardingStatus used (not STORE_* alone).
    // P2-3: admin 판정은 membership verdict — getOnboardingStatus / resolveMemberConsentAuthority 와 동일.
    {
      hasSession: true,
      privilegedAdmin: status.isPrivilegedAdmin === true,
      requiredConsent: status.requiredConsent ?? null,
    }
  );
}

export function resolvePostLoginRoute({
  hasSession,
  status,
  next,
  inSession = false,
}: ResolvePostLoginRouteParams): string {
  if (!hasSession) {
    return "/login?error=session_missing";
  }
  const landing = inSession
    ? sanitizeNextPath(next ?? null)
    : sanitizeFreshLoginLandingPath(sanitizeNextPath(next ?? null));
  if (!status) {
    return landing ?? POST_LOGIN_PATH;
  }
  const signup = onboardingStatusToDibaySignup(status);
  if (!signup.consentComplete) {
    return resolveDibaySignupRoute(signup, next);
  }
  const step = status.registrationNextStep ?? null;
  if (step && step !== "terms") {
    return registrationStepHref(step, landing) ?? resolveDibaySignupRoute(signup, next);
  }
  if (inSession) return landing ?? POST_LOGIN_PATH;
  return resolveDibaySignupRoute(signup, next);
}
