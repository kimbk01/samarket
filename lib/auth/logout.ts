"use client";

/**
 * 디바이 앱 세션 종료 (카카오·배민·당근형 모바일 정책)
 * @see docs/dibay-session-policy.md
 */

import {
  logoutCurrentDevice,
  logoutAllDevices,
  forceClearCorruptSession,
  type LogoutResult,
} from "@/lib/auth/logout-client";

export type { LogoutResult } from "@/lib/auth/logout-client";

export async function logoutDiBaYAppSession(): Promise<LogoutResult> {
  return logoutCurrentDevice();
}

export async function logoutDiBaYAllDevices(): Promise<LogoutResult> {
  return logoutAllDevices();
}

export async function forceClearDiBaYCorruptSession(): Promise<LogoutResult> {
  return forceClearCorruptSession();
}
