"use client";

import { logoutDiBaYAppSession } from "@/lib/auth/logout";
import {
  isAuthExitNavigateStarted,
  markAuthExitNavigateStarted,
} from "@/lib/auth/auth-exit-guard";
import { navigateAfterAuthExit, type AuthExitReason } from "@/lib/auth/navigate-after-auth-exit";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const AUTH_EXIT_FLIGHT_PREFIX = "auth-exit:";

export {
  isAuthExitNavigateStarted,
  resetAuthExitNavigateGuard,
} from "@/lib/auth/auth-exit-guard";

export function navigateAfterAuthExitOnce(reason: AuthExitReason): void {
  if (isAuthExitNavigateStarted()) return;
  markAuthExitNavigateStarted();
  navigateAfterAuthExit(reason);
}

/**
 * 세션 만료·강제 로그아웃 — wipe+replace 단일 비행.
 * SessionLostRedirect·AuthSessionBoundary 등에서 공유.
 */
export async function runAuthSessionExpiredExit(): Promise<{ ok: boolean }> {
  return runSingleFlight(`${AUTH_EXIT_FLIGHT_PREFIX}session_expired`, async () => {
    if (isAuthExitNavigateStarted()) return { ok: true };
    const result = await logoutDiBaYAppSession();
    if (result.ok) {
      navigateAfterAuthExitOnce("session_expired");
      return { ok: true };
    }
    return { ok: false };
  });
}

export async function runAuthLogoutExit(): Promise<{ ok: boolean; message?: string | null }> {
  return runSingleFlight(`${AUTH_EXIT_FLIGHT_PREFIX}logout`, async () => {
    if (isAuthExitNavigateStarted()) return { ok: true };
    const result = await logoutDiBaYAppSession();
    if (result.ok) {
      navigateAfterAuthExitOnce("logout");
      return { ok: true };
    }
    return { ok: false, message: result.ok === false ? result.message : null };
  });
}

export async function runAuthAccountSwitchExit(): Promise<void> {
  return runSingleFlight(`${AUTH_EXIT_FLIGHT_PREFIX}account_switch`, async () => {
    if (isAuthExitNavigateStarted()) return;
    navigateAfterAuthExitOnce("account_switch");
  });
}
