"use client";

import { checkAndroidNativeDevicePermission, shouldUseAndroidNativeDevicePermissionBridge } from "@/lib/permissions/native-device-permissions-plugin";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { syncNotificationState } from "@/lib/permissions/permission-manager/notification-permission-manager";
import { logPushRegisterFail } from "@/lib/push/native/native-push-register-log";

export type NativeNotificationPermissionState = "granted" | "denied" | "prompt" | "unknown";

async function checkCapacitorPushPermission(): Promise<NativeNotificationPermissionState> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === "granted") return "granted";
    if (perm.receive === "denied") return "denied";
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") return "prompt";
    return "unknown";
  } catch (e) {
    logPushRegisterFail("push_check_permissions_error", {
      message: e instanceof Error ? e.message : "unknown",
    });
    return "unknown";
  }
}

/** Read-only — use {@link syncNotificationState} / PermissionManager for composite receiveReady. */
export async function checkNativeNotificationPermission(): Promise<NativeNotificationPermissionState> {
  if (!isCapacitorNativePlatform()) return "unknown";

  const snapshot = await syncNotificationState();
  if (snapshot.receiveReady) return "granted";

  if (shouldUseAndroidNativeDevicePermissionBridge()) {
    const native = await checkAndroidNativeDevicePermission("notification");
    if (native === "granted") return "granted";
    if (native === "denied") return "denied";
    if (native === "prompt") return "prompt";
  }

  if (resolveCapacitorShellPlatform() === "ios") {
    return checkCapacitorPushPermission();
  }

  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    if (Notification.permission === "default") return "prompt";
  }

  return "unknown";
}

/**
 * @deprecated Use {@link runNotificationGuideFlow} + {@link requestNotificationFromGuide} via PermissionManager.
 * Kept for legacy imports — delegates to PermissionManager (Guide must run first).
 */
export async function requestNativeNotificationPermissionIfNeeded(): Promise<NativeNotificationPermissionState> {
  const { requestNotificationFromGuide } = await import(
    "@/lib/permissions/permission-manager/notification-permission-manager"
  );
  const result = await requestNotificationFromGuide();
  if (result.ok && result.snapshot.receiveReady) return "granted";
  if (result.snapshot.effectiveState === "PERMANENT_DENIED" || result.snapshot.effectiveState === "SYSTEM_DISABLED") {
    return "denied";
  }
  if (result.snapshot.effectiveState === "DENIED") return "denied";
  return "prompt";
}
