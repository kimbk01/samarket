"use client";

import type {
  NotificationPermissionState,
  NotificationReceiveSnapshot,
} from "@/lib/permissions/permission-manager/notification-permission-types";

function webPermissionState(): NotificationPermission | null {
  if (typeof window === "undefined" || !("Notification" in window)) return null;
  return Notification.permission;
}

/** LOCK — sole Web Notification.requestPermission path (via adapter). */
export async function requestWebNotificationRuntimePermission(): Promise<
  "granted" | "denied" | "prompt" | "skipped"
> {
  if (typeof window === "undefined" || !("Notification" in window)) return "skipped";
  const existing = Notification.permission;
  if (existing === "granted" || existing === "denied") return existing;
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") return "granted";
    if (permission === "denied") return "denied";
    return "prompt";
  } catch {
    return "denied";
  }
}

export async function readWebNotificationReceiveSnapshot(
  appBlocked: boolean,
): Promise<NotificationReceiveSnapshot> {
  if (typeof window === "undefined") {
    return buildNotSupportedSnapshot();
  }
  if (!window.isSecureContext) {
    return buildNotSupportedSnapshot("insecure_context");
  }
  if (!("Notification" in window)) {
    return buildNotSupportedSnapshot("no_api");
  }

  const perm = webPermissionState();
  const runtimeGranted = perm === "granted";

  let effectiveState: NotificationPermissionState = "UNKNOWN";
  if (runtimeGranted && !appBlocked) {
    effectiveState = "GRANTED";
  } else if (perm === "denied" || appBlocked) {
    effectiveState = "PERMANENT_DENIED";
  } else if (perm === "default") {
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

function buildNotSupportedSnapshot(reason = "not_supported"): NotificationReceiveSnapshot {
  return {
    effectiveState: "NOT_SUPPORTED",
    notificationRuntimePermission: false,
    appNotificationsEnabled: false,
    incomingCallChannelEnabled: false,
    fullScreenIntentEnabled: false,
    batteryUnrestrictedOrUnknown: "unknown",
    samsungSleepRisk: "unknown",
    receiveReady: false,
    lockScreenIncomingReady: false,
    blockReason: reason,
    manufacturer: null,
    syncedAt: Date.now(),
  };
}
