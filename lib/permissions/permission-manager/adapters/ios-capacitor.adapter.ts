"use client";

import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import type {
  NotificationPermissionState,
  NotificationReceiveSnapshot,
} from "@/lib/permissions/permission-manager/notification-permission-types";

async function checkCapacitorPushPermission(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === "granted") return "granted";
    if (perm.receive === "denied") return "denied";
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") return "prompt";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** LOCK — sole iOS PushNotifications.requestPermissions path (via adapter). */
export async function requestIosNotificationRuntimePermission(): Promise<
  "granted" | "denied" | "prompt" | "skipped"
> {
  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "ios") return "skipped";
  const current = await checkCapacitorPushPermission();
  if (current === "granted" || current === "denied") return current;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive === "granted") return "granted";
    if (perm.receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "prompt";
  }
}

export async function readIosNotificationReceiveSnapshot(
  appBlocked: boolean,
): Promise<NotificationReceiveSnapshot | null> {
  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "ios") return null;

  const pushState = await checkCapacitorPushPermission();
  const runtimeGranted = pushState === "granted";

  let effectiveState: NotificationPermissionState = "UNKNOWN";
  if (runtimeGranted && !appBlocked) {
    effectiveState = "GRANTED";
  } else if (pushState === "denied" || appBlocked) {
    effectiveState = "PERMANENT_DENIED";
  } else if (pushState === "prompt") {
    effectiveState = "UNKNOWN";
  } else {
    effectiveState = "DENIED";
  }

  const receiveReady = runtimeGranted && !appBlocked;

  return {
    effectiveState: receiveReady ? "GRANTED" : effectiveState,
    notificationRuntimePermission: runtimeGranted,
    appNotificationsEnabled: runtimeGranted,
    incomingCallChannelEnabled: runtimeGranted,
    fullScreenIntentEnabled: true,
    batteryUnrestrictedOrUnknown: "unknown",
    samsungSleepRisk: "unknown",
    receiveReady,
    lockScreenIncomingReady: receiveReady,
    blockReason: receiveReady ? undefined : appBlocked ? "notification_required_blocked" : "runtime_permission",
    manufacturer: null,
    syncedAt: Date.now(),
  };
}
