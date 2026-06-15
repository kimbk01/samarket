/**
 * 로그인 후 온보딩 오버레이(알림·통화 미디어) 공통 진입 조건.
 * 주소는 기능별 requireProfileCompletion — 알림·미디어 프롬프트를 막지 않는다.
 */
import { getSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { shouldOfferDiBaYNotificationPrePrompt } from "@/lib/notifications/dibay-notification-prompt-storage";

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

export function canAttemptPostLoginOnboardingGate(pathname: string, deferStoresHomeLcp: boolean): boolean {
  if (typeof window === "undefined") return false;
  if (deferStoresHomeLcp) return false;
  if (isPostLoginOnboardingAuthExcludedPath(pathname)) return false;
  if (isPostLoginOnboardingAddressPath(pathname)) return false;
  if (!getSupabaseProfileCache()?.id) return false;
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

/** 알림 온보딩 모달이 닫히거나 스킵된 뒤 — 통화 mic/cam 온보딩이 이어지도록 알림 */
export const DIBAY_NOTIFICATION_ONBOARDING_SETTLED_EVENT = "dibay:notification-onboarding-settled";

export function notifyNotificationOnboardingSettled(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DIBAY_NOTIFICATION_ONBOARDING_SETTLED_EVENT));
}

/** 알림 프리프롬프트가 아직 남아 있고 OS 권한이 미결정이면 통화 온보딩을 뒤로 미룬다 */
export function shouldDeferCallMediaOnboardingForNotification(): boolean {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;
  if (!shouldOfferDiBaYNotificationPrePrompt()) return false;
  return Notification.permission === "default";
}
