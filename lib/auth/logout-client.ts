/**
 * 클라이언트 로그아웃 — explicit logout flow SSOT.
 * @see lib/auth/explicit-logout-flow.ts
 * @see docs/dibay-session-policy.md
 */

import { runExplicitLogoutFlow } from "@/lib/auth/explicit-logout-flow";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { disconnectNativeDevicesForLogout } from "@/lib/push/disconnect-native-devices-for-logout-client";
import { disconnectWebPushSubscriptionsForLogout } from "@/lib/push/disconnect-web-push-for-logout-client";

export type LogoutResult =
  | { ok: true; serverWarning?: string | null }
  | { ok: false; message: string };

function logoutT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

/** 현재 기기 — deactivate → server logout → signOut → wipe → terminal_guest */
export async function logoutCurrentDevice(): Promise<LogoutResult> {
  if (typeof window === "undefined") {
    return { ok: false, message: logoutT("auth_logout_err_browser_only") };
  }
  const { localSignOutOk, serverWarning } = await runExplicitLogoutFlow("current_device");
  if (!localSignOutOk && serverWarning) {
    return { ok: true, serverWarning };
  }
  return { ok: true, serverWarning: serverWarning ?? null };
}

/** 모든 기기 — global signOut 포함 explicit flow */
export async function logoutAllDevices(): Promise<LogoutResult> {
  if (typeof window === "undefined") {
    return { ok: false, message: logoutT("auth_logout_err_browser_only") };
  }
  const { localSignOutOk, serverWarning } = await runExplicitLogoutFlow("all_devices");
  if (!localSignOutOk && serverWarning) {
    return { ok: true, serverWarning };
  }
  return { ok: true, serverWarning: serverWarning ?? null };
}

/** refresh token 무효·corrupt — best-effort disconnect 후 local wipe */
export async function forceClearCorruptSession(): Promise<LogoutResult> {
  if (typeof window === "undefined") {
    return { ok: false, message: logoutT("auth_logout_err_browser_only") };
  }
  const { applyImmediateLogoutClientState } = await import("@/lib/auth/auth-session-immediate.client");
  const { wipeClientSessionState, markExplicitLogoutWipeDone } = await import("@/lib/auth/client-session-wipe");
  const { establishGuestAuthState } = await import("@/lib/auth/guest-auth-state");
  const { markSessionTerminalGuestFromClient } = await import("@/lib/auth/dibay-session-manager");
  const { getSupabaseClient } = await import("@/lib/supabase/client");

  markExplicitLogoutWipeDone();
  const sb = getSupabaseClient();
  await disconnectWebPushSubscriptionsForLogout().catch(() => undefined);
  await disconnectNativeDevicesForLogout().catch(() => undefined);
  await sb?.auth.signOut({ scope: "local" }).catch(() => undefined);
  await wipeClientSessionState("user_logout");
  establishGuestAuthState("corrupt_session_clear");
  markSessionTerminalGuestFromClient("corrupt_session_clear");
  applyImmediateLogoutClientState();
  const { awaitLogoutNativeBadgeDurableClear } = await import("@/lib/auth/explicit-logout-flow");
  await awaitLogoutNativeBadgeDurableClear({
    reason: "corrupt_session_clear",
    previousViewerId: null,
  });
  return { ok: true, serverWarning: null };
}

/** @deprecated `logoutCurrentDevice` 사용 */
export async function performClientLogout(): Promise<LogoutResult> {
  return logoutCurrentDevice();
}
