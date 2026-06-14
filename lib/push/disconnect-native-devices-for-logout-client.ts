"use client";

import { ensureClientInstanceId } from "@/lib/auth/client-instance-id";

/**
 * 로그아웃 시 native device token 비활성화 (web push unsubscribe 와 병행).
 */
export async function disconnectNativeDevicesForLogout(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const deviceId = ensureClientInstanceId();
    await fetch("/api/me/devices/deactivate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId }),
    }).catch(() => undefined);
  } catch {
    /* best-effort */
  }
}

/** 계정 전환 — 동일 기기의 이전 계정 token 즉시 비활성 */
export async function disconnectNativeDevicesOnAccountSwitch(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const deviceId = ensureClientInstanceId();
    await fetch("/api/me/devices/deactivate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId, scope: "device_all_users" }),
    }).catch(() => undefined);
  } catch {
    /* best-effort */
  }
}
