"use client";

const PROFILE_SETUP_DEFER_SESSION_KEY = "dibay:profile-setup-deferred";

/** setup=1 강제 화면에서 취소 — 이번 브라우저 세션 동안 MandatoryAddressGate 자동 리다이렉트 억제 */
export function isProfileSetupDeferredForSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(PROFILE_SETUP_DEFER_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function deferProfileSetupForSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PROFILE_SETUP_DEFER_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearProfileSetupDeferForSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PROFILE_SETUP_DEFER_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
