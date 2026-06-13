"use client";

import { wipeClientSessionState } from "@/lib/auth/client-session-wipe";

/**
 * 로그아웃보다 강한 전체 클라이언트 auth·캐시 정리 (개발·앱 리셋용).
 */
export async function resetAuthState(): Promise<void> {
  if (typeof window === "undefined") return;
  await wipeClientSessionState("user_logout", { setPostLogoutGuard: true });
}

export function exposeResetAuthStateForDev(): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return;
  (window as Window & { __dibayResetAuthState?: () => Promise<void> }).__dibayResetAuthState =
    resetAuthState;
}
