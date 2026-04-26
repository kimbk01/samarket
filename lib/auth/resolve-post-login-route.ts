import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { withNextSearchParam, sanitizeNextPath } from "@/lib/auth/safe-next-path";
import type { OnboardingStatus } from "@/lib/auth/get-onboarding-status";

/**
 * 로그인 콜백·세션 복원·온보딩 화면 종료 시 다음 라우트를 결정한다 (스펙 1).
 *
 *  분기 (위에서 아래로 평가):
 *    A. 세션 없음                   → `/login?error=session_missing`
 *    B. 동의 미완료(약관·개인정보) → `/auth/consent?next=...`
 *    C. 닉네임/필수 프로필 미완   → `/onboarding/profile?next=...`
 *    D. 대표 주소 미설정          → `/onboarding/address?next=...`
 *    E. 모두 완료                  → `next || POST_LOGIN_PATH(/home)`
 *
 *  전화번호 인증(스펙 1-D)은 *읽기는 허용*이므로 이 단계에서는 강제하지 않는다.
 *  쓰기 액션 시 별도 게이트(`buildPhoneVerificationHref`) 가 처리한다.
 *
 *  이 함수는 순수 함수다. DB·세션 의존성은 호출 측이 주입한다.
 */
export type ResolvePostLoginRouteParams = {
  hasSession: boolean;
  status: OnboardingStatus | null;
  next?: string | null;
};

export function resolvePostLoginRoute({
  hasSession,
  status,
  next,
}: ResolvePostLoginRouteParams): string {
  if (!hasSession) {
    return "/login?error=session_missing";
  }
  if (!status) {
    return POST_LOGIN_PATH;
  }
  const safeNext = sanitizeNextPath(next ?? null);

  // 관리자(특권 역할)는 동의/주소 게이트를 건너뛴다 — 운영 동선에서 갑자기 막히지 않도록.
  if (status.isPrivilegedAdmin) {
    return safeNext ?? POST_LOGIN_PATH;
  }

  if (!status.consentComplete) {
    return withNextSearchParam("/auth/consent", safeNext);
  }
  if (!status.profileComplete || !status.nicknameComplete) {
    return withNextSearchParam("/onboarding/profile", safeNext);
  }
  if (!status.addressComplete) {
    return withNextSearchParam("/onboarding/address", safeNext);
  }
  return safeNext ?? POST_LOGIN_PATH;
}
