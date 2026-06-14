"use client";

/**
 * 디바이 앱 세션 종료 (카카오·배민·당근형 모바일 정책)
 * @see docs/dibay-session-policy.md
 */

import { disconnectWebPushSubscriptionsForLogout } from "@/lib/push/disconnect-web-push-for-logout-client";
import {
  logoutCurrentDevice,
  logoutAllDevices,
  forceClearCorruptSession,
  type LogoutResult,
} from "@/lib/auth/logout-client";

export type { LogoutResult } from "@/lib/auth/logout-client";

export async function logoutDiBaYAppSession(): Promise<LogoutResult> {
  void disconnectWebPushSubscriptionsForLogout();
  return logoutCurrentDevice();
}

export async function logoutDiBaYAllDevices(): Promise<LogoutResult> {
  void disconnectWebPushSubscriptionsForLogout();
  return logoutAllDevices();
}

export async function forceClearDiBaYCorruptSession(): Promise<LogoutResult> {
  return forceClearCorruptSession();
}
