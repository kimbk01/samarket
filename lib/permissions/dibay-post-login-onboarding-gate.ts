/**
 * 로그인 후 온보딩 오버레이(알림·통화 미디어) 공통 진입 조건.
 * 주소는 기능별 requireProfileCompletion — 알림·미디어 프롬프트를 막지 않는다.
 */
import { getBoundAuthUserId } from "@/lib/auth/client-instance-id";
import { getSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { shouldOfferDiBaYNotificationPrePrompt } from "@/lib/notifications/dibay-notification-prompt-storage";

/** profile cache 하이드레이션 후 온보딩 gate 재시도 */
export const DIBAY_POST_LOGIN_ONBOARDING_PROFILE_RETRY_EVENT = "dibay:post-login-onboarding-profile-retry";

export function notifyPostLoginOnboardingProfileRetry(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DIBAY_POST_LOGIN_ONBOARDING_PROFILE_RETRY_EVENT));
}

/** 로그인 사용자 식별 — profile cache 레이스 시 bound auth userId 로 완화 */
export function resolvePostLoginOnboardingUserId(): string | null {
  const profileId = getSupabaseProfileCache()?.id?.trim();
  if (profileId) return profileId;
  const bound = getBoundAuthUserId()?.trim();
  return bound || null;
}

export function isPostLoginOnboardingAuthExcludedPath(path: string): boolean {
  return (
    path === "/login" ||
    path.startsWith("/login/") ||
    path === "/signup" ||
    path.startsWith("/signup/") ||
    path.startsWith("/auth/")
  );
}

export function isPostLoginOnboardingAddressPath(path: string): boolean {
  return path === "/onboarding/address" || path.startsWith("/onboarding/address/");
}

export function isPostLoginOnboardingPathEligible(pathname: string, deferStoresHomeLcp: boolean): boolean {
  if (typeof window === "undefined") return false;
  if (deferStoresHomeLcp) return false;
  if (isPostLoginOnboardingAuthExcludedPath(pathname)) return false;
  if (isPostLoginOnboardingAddressPath(pathname)) return false;
  return true;
}

export function canAttemptPostLoginOnboardingGate(pathname: string, deferStoresHomeLcp: boolean): boolean {
  if (!isPostLoginOnboardingPathEligible(pathname, deferStoresHomeLcp)) return false;
  if (!resolvePostLoginOnboardingUserId()) return false;
  return true;
}

export async function isPostLoginOnboardingBlockedByAddressGate(): Promise<boolean> {
  return false;
}

export function schedulePostLoginOnboardingOpen(run: () => void): void {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 900 });
  } else {
    window.setTimeout(run, 480);
  }
}

/** @deprecated 통합 DiBaYDevicePermissionOnboardingGate 사용 — settled 이벤트는 하위 호환용 */
export const DIBAY_NOTIFICATION_ONBOARDING_SETTLED_EVENT = "dibay:notification-onboarding-settled";

export function notifyNotificationOnboardingSettled(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DIBAY_NOTIFICATION_ONBOARDING_SETTLED_EVENT));
}

/** @deprecated 통합 온보딩 게이트가 순서를 내부에서 처리 */
export function shouldDeferCallMediaOnboardingForNotification(): boolean {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;
  if (!shouldOfferDiBaYNotificationPrePrompt()) return false;
  return Notification.permission === "default";
}
