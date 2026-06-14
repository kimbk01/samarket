"use client";

import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import {
  checkAndroidNativeDevicePermission,
  requestAndroidNativeDevicePermission,
} from "@/lib/permissions/native-device-permissions-plugin";
import { logPushRegister, logPushRegisterFail } from "@/lib/push/native/native-push-register-log";

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

async function requestCapacitorPushPermission(): Promise<NativeNotificationPermissionState> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive === "granted") return "granted";
    if (perm.receive === "denied") return "denied";
    return "prompt";
  } catch (e) {
    logPushRegisterFail("push_request_permissions_error", {
      message: e instanceof Error ? e.message : "unknown",
    });
    return "unknown";
  }
}

/** OS PushNotifications permission — Android 13+ 는 NativeDevicePermissions(POST_NOTIFICATIONS) 우선. */
export async function checkNativeNotificationPermission(): Promise<NativeNotificationPermissionState> {
  if (!isCapacitorNativePlatform()) return "unknown";

  if (resolveCapacitorShellPlatform() === "android") {
    const native = await checkAndroidNativeDevicePermission("notification");
    if (native === "granted") return "granted";
    if (native === "denied") return "denied";
    if (native === "prompt") return "prompt";
  }

  return checkCapacitorPushPermission();
}

/**
 * 알림 권한 요청 — prompt 상태에서만 1회 요청. granted/denied면 재요청하지 않음.
 */
export async function requestNativeNotificationPermissionIfNeeded(): Promise<NativeNotificationPermissionState> {
  const current = await checkNativeNotificationPermission();
  logPushRegister("permission_check", { state: current });
  if (current === "granted" || current === "denied") return current;
  if (!isCapacitorNativePlatform()) return "unknown";

  if (resolveCapacitorShellPlatform() === "android") {
    logPushRegister("permission_request", { channel: "native_device_permissions" });
    const native = await requestAndroidNativeDevicePermission("notification");
    if (native === "granted" || native === "denied") {
      logPushRegister("permission_check", { state: native, channel: "native_device_permissions" });
      return native;
    }
  }

  logPushRegister("permission_request", { channel: "capacitor_push_notifications" });
  const capacitor = await requestCapacitorPushPermission();
  logPushRegister("permission_check", { state: capacitor, channel: "capacitor_push_notifications" });
  return capacitor;
}
