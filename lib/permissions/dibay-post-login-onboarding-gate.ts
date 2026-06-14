/**
 * 로그인 후 온보딩 오버레이(알림·통화 미디어) 공통 진입 조건.
 * 주소는 기능별 requireProfileCompletion — 알림·미디어 프롬프트를 막지 않는다.
 */
import { getSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";

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
