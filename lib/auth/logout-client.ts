/**
 * 클라이언트 로그아웃 — DIBAY 3종 정책.
 * UI·게스트 캐시는 즉시 반영하고, local signOut 은 navigate 전 await, wipe·서버 통지는 백그라운드.
 * @see docs/dibay-session-policy.md
 */

import { applyImmediateLogoutClientState } from "@/lib/auth/auth-session-immediate.client";
import {
  wipeClientSessionState,
  markExplicitLogoutWipeDone,
} from "@/lib/auth/client-session-wipe";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { getSupabaseClient } from "@/lib/supabase/client";

export type LogoutResult =
  | { ok: true; serverWarning?: string | null }
  | { ok: false; message: string };

const SUPABASE_SIGNOUT_TIMEOUT_MS = 5_000;
const SERVER_LOGOUT_TIMEOUT_MS = 5_000;

function logoutT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

function normalizeLogoutErrorMessage(raw: unknown): string {
  const message = String(raw ?? "").trim();
  return message || logoutT("auth_logout_err_failed");
}

async function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fallback = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise, fallback]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function logLogoutResult(scope: "current_device" | "all_devices" | "corrupt", detail: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  console.info("[auth:logout]", { scope, ...detail });
}

async function localSupabaseSignOut(): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return true;
  const result = await raceWithTimeout(
    supabase.auth
      .signOut({ scope: "local" })
      .then(() => true)
      .catch(() => false),
    SUPABASE_SIGNOUT_TIMEOUT_MS,
  );
  return result === true;
}

async function globalSupabaseSignOut(): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return true;
  const result = await raceWithTimeout(
    supabase.auth
      .signOut({ scope: "global" })
      .then(() => true)
      .catch(() => false),
    SUPABASE_SIGNOUT_TIMEOUT_MS,
  );
  return result === true;
}

async function reportServerLogout(path: "/api/auth/logout" | "/api/auth/logout-all"): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(path, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      timeoutMs: SERVER_LOGOUT_TIMEOUT_MS,
    });
    const payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;
    if (!res.ok || payload?.ok !== true) {
      return normalizeLogoutErrorMessage(payload?.error);
    }
    return null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return logoutT("auth_logout_err_server_slow");
    }
    return logoutT("auth_logout_err_server_unreachable");
  }
}

type LogoutBackgroundScope = "current_device" | "all_devices" | "corrupt";

async function runLogoutBackgroundCleanup(
  scope: LogoutBackgroundScope,
  options?: { skipLocalSignOut?: boolean; localSignOutOk?: boolean }
): Promise<void> {
  const skipLocalSignOut = options?.skipLocalSignOut === true;
  let localSignOutOk = options?.localSignOutOk ?? true;
  if (!skipLocalSignOut) {
    localSignOutOk =
      scope === "all_devices" ? await globalSupabaseSignOut() : await localSupabaseSignOut();
  }
  await wipeClientSessionState("user_logout");
  const serverWarning =
    scope === "corrupt"
      ? null
      : await reportServerLogout(scope === "all_devices" ? "/api/auth/logout-all" : "/api/auth/logout");

  logLogoutResult(scope, {
    localSignOutOk,
    serverWarning,
    wipeDone: true,
    background: true,
  });
}

async function beginImmediateLogout(scope: LogoutBackgroundScope): Promise<LogoutResult> {
  markExplicitLogoutWipeDone();
  applyImmediateLogoutClientState();

  /**
   * 체감 속도 우선: local/global signOut + wipe/server 통지는 백그라운드 처리.
   * 즉시 guest 상태 반영 후 이동을 막지 않는다.
   */
  void runLogoutBackgroundCleanup(scope).catch((err) => {
    if (typeof console !== "undefined") {
      console.error("[auth:logout] background cleanup failed", err);
    }
  });
  return { ok: true, serverWarning: null };
}

/** 현재 기기만 — UI 즉시 guest, local signOut 선행, wipe·서버는 백그라운드 */
export async function logoutCurrentDevice(): Promise<LogoutResult> {
  if (typeof window === "undefined") {
    return { ok: false, message: logoutT("auth_logout_err_browser_only") };
  }
  return beginImmediateLogout("current_device");
}

/** 모든 기기 — UI 즉시 guest, global signOut 선행, wipe·서버는 백그라운드 */
export async function logoutAllDevices(): Promise<LogoutResult> {
  if (typeof window === "undefined") {
    return { ok: false, message: logoutT("auth_logout_err_browser_only") };
  }
  return beginImmediateLogout("all_devices");
}

/** refresh token 무효·corrupt — local wipe only (서버 호출 없음) */
export async function forceClearCorruptSession(): Promise<LogoutResult> {
  if (typeof window === "undefined") {
    return { ok: false, message: logoutT("auth_logout_err_browser_only") };
  }
  return beginImmediateLogout("corrupt");
}

/** @deprecated `logoutCurrentDevice` 사용 */
export async function performClientLogout(): Promise<LogoutResult> {
  return logoutCurrentDevice();
}
