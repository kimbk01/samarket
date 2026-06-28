"use client";

/**
 * 명시 로그아웃 단일 플로우 — deactivate → server logout → local signOut → wipe → terminal_guest.
 * @see docs/dibay-session-policy.md
 */

import { applyImmediateLogoutClientState } from "@/lib/auth/auth-session-immediate.client";
import {
  markExplicitLogoutWipeDone,
  wipeClientSessionState,
} from "@/lib/auth/client-session-wipe";
import { ensureClientInstanceId, getBoundAuthUserId } from "@/lib/auth/client-instance-id";
import { logExplicitLogoutAudit } from "@/lib/auth/explicit-logout-audit-log";
import { establishGuestAuthState } from "@/lib/auth/guest-auth-state";
import { markSessionTerminalGuestFromClient } from "@/lib/auth/dibay-session-manager";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { disconnectNativeDevicesForLogout } from "@/lib/push/disconnect-native-devices-for-logout-client";
import { disconnectWebPushSubscriptionsForLogout } from "@/lib/push/disconnect-web-push-for-logout-client";
import { clearNativeBadgeCount } from "@/lib/push/native/sync-native-badge-count";
import { getSupabaseClient } from "@/lib/supabase/client";

const SUPABASE_SIGNOUT_TIMEOUT_MS = 5_000;
const SERVER_LOGOUT_TIMEOUT_MS = 5_000;

export type ExplicitLogoutScope = "current_device" | "all_devices";

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

async function reportServerLogout(
  path: "/api/auth/logout" | "/api/auth/logout-all",
  deviceId: string,
): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(path, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      timeoutMs: SERVER_LOGOUT_TIMEOUT_MS,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId }),
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

export type ExplicitLogoutFlowResult = {
  localSignOutOk: boolean;
  serverWarning: string | null;
};

/** B→F 순서 고정. 세션·쿠키는 deactivate/server 호출 전까지 유지한다. */
export async function runExplicitLogoutFlow(scope: ExplicitLogoutScope): Promise<ExplicitLogoutFlowResult> {
  logExplicitLogoutAudit("explicit_logout_start", { scope });

  const deviceId = ensureClientInstanceId();
  const userId = getBoundAuthUserId();
  logExplicitLogoutAudit("explicit_logout_context", {
    scope,
    device_id: deviceId,
    user_id: userId ?? null,
  });

  void disconnectWebPushSubscriptionsForLogout();
  void clearNativeBadgeCount();

  logExplicitLogoutAudit("logout_device_deactivate_start", { device_id: deviceId });
  try {
    await disconnectNativeDevicesForLogout();
    logExplicitLogoutAudit("logout_device_deactivate_done", { device_id: deviceId });
  } catch (error) {
    logExplicitLogoutAudit("logout_device_deactivate_failed", {
      device_id: deviceId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const serverPath = scope === "all_devices" ? "/api/auth/logout-all" : "/api/auth/logout";
  logExplicitLogoutAudit("auth_logout_server_start", { path: serverPath });
  const serverWarning = await reportServerLogout(serverPath, deviceId);
  logExplicitLogoutAudit("auth_logout_server_done", {
    path: serverPath,
    serverWarning: serverWarning ?? null,
  });

  const localSignOutOk =
    scope === "all_devices" ? await globalSupabaseSignOut() : await localSupabaseSignOut();

  markExplicitLogoutWipeDone();
  logExplicitLogoutAudit("client_session_wipe_after_logout", { scope });
  await wipeClientSessionState("user_logout");

  establishGuestAuthState(`explicit_logout:${scope}`);
  markSessionTerminalGuestFromClient(`explicit_logout:${scope}`);
  applyImmediateLogoutClientState();
  logExplicitLogoutAudit("terminal_guest_after_explicit_logout", { scope });

  return { localSignOutOk, serverWarning };
}
