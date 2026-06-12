"use client";

import {
  forceClearDiBaYCorruptSession,
  logoutDiBaYAppSession,
} from "@/lib/auth/logout";
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

/** refresh token terminal — corrupt session only */
export async function runAuthSessionExpiredExit(): Promise<{ ok: boolean }> {
  return runSingleFlight(`${AUTH_EXIT_FLIGHT_PREFIX}session_expired`, async () => {
    if (isAuthExitNavigateStarted()) return { ok: true };
    const result = await forceClearDiBaYCorruptSession();
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

/** 미로그인·guest — 만료 문구 없이 auth_required */
export async function runAuthRequiredExit(): Promise<void> {
  return runSingleFlight(`${AUTH_EXIT_FLIGHT_PREFIX}auth_required`, async () => {
    if (isAuthExitNavigateStarted()) return;
    navigateAfterAuthExitOnce("auth_required");
  });
}

export async function runAuthAccountSwitchExit(): Promise<void> {
  return runSingleFlight(`${AUTH_EXIT_FLIGHT_PREFIX}account_switch`, async () => {
    if (isAuthExitNavigateStarted()) return;
    navigateAfterAuthExitOnce("account_switch");
  });
}
