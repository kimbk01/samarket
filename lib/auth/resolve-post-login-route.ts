import type { OnboardingStatus } from "@/lib/auth/get-onboarding-status";
import {
  deriveDibaySignupStatus,
  resolveDibaySignupRoute,
} from "@/lib/auth/dibay-signup-status";
import { sanitizeFreshLoginLandingPath, sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";

/**
 * 로그인 콜백·세션 복원·온보딩 화면 종료 시 다음 라우트를 결정한다.
 *
 * 가입 완료(signupComplete): 약관·개인정보 동의만 (법적 최소).
 * @id·프로필·주소·전화는 기능별 requireProfileCompletion gate.
 */
export type ResolvePostLoginRouteParams = {
  hasSession: boolean;
  status: OnboardingStatus | null;
  next?: string | null;
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
    { hasSession: true }
  );
}

export function resolvePostLoginRoute({
  hasSession,
  status,
  next,
}: ResolvePostLoginRouteParams): string {
  if (!hasSession) {
    return "/login?error=session_missing";
  }
  if (!status) {
    return sanitizeFreshLoginLandingPath(sanitizeNextPath(next ?? null)) ?? POST_LOGIN_PATH;
  }
  return resolveDibaySignupRoute(onboardingStatusToDibaySignup(status), next);
}
