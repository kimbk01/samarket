"use client";

import {
  checkAndroidCallReceiveSettings,
  checkAndroidNativeDevicePermission,
  requestAndroidNativeDevicePermission,
  shouldUseAndroidNativeDevicePermissionBridge,
} from "@/lib/permissions/native-device-permissions-plugin";
import type {
  BatteryUnrestrictedState,
  NotificationPermissionState,
  NotificationReceiveSnapshot,
} from "@/lib/permissions/permission-manager/notification-permission-types";

function batteryStateFromAndroid(ignored: boolean | undefined): BatteryUnrestrictedState {
  if (ignored === true) return "unrestricted";
  if (ignored === false) return "restricted";
  return "unknown";
}

function resolveRuntimeState(
  runtimeGranted: boolean,
  nativeState: "granted" | "denied" | "prompt" | null,
): NotificationPermissionState {
  if (runtimeGranted) return "GRANTED";
  if (nativeState === "denied") return "PERMANENT_DENIED";
  if (nativeState === "prompt") return "UNKNOWN";
  return "DENIED";
}

/** Read-only Android composite snapshot for notification receive. */
export async function readAndroidNotificationReceiveSnapshot(
  appBlocked: boolean,
): Promise<NotificationReceiveSnapshot | null> {
  if (!shouldUseAndroidNativeDevicePermissionBridge()) return null;

  const [settings, nativeState] = await Promise.all([
    checkAndroidCallReceiveSettings(),
    checkAndroidNativeDevicePermission("notification"),
  ]);

  if (!settings) return null;

  const runtimeGranted = settings.notificationRuntimeGranted;
  const appEnabled = settings.notificationsEnabled;
  const incomingChannelEnabled =
    settings.incomingCallChannelEnabled ??
    (!settings.incomingChannelBlocked ||
      !settings.nativeVoiceChannelBlocked ||
      !settings.nativeVideoChannelBlocked);
  const battery = batteryStateFromAndroid(settings.batteryOptimizationIgnored);

  let effectiveState: NotificationPermissionState = "UNKNOWN";
  let blockReason: string | undefined;

  if (!runtimeGranted) {
    effectiveState = resolveRuntimeState(false, nativeState);
    blockReason = "runtime_permission";
  } else if (!appEnabled) {
    effectiveState = "SYSTEM_DISABLED";
    blockReason = "app_notifications_disabled";
  } else if (!incomingChannelEnabled) {
    effectiveState = "SYSTEM_DISABLED";
    blockReason = "incoming_channel_disabled";
  } else if (appBlocked) {
    effectiveState = "PERMANENT_DENIED";
    blockReason = "notification_required_blocked";
  } else {
    effectiveState = "GRANTED";
  }

  const receiveReady =
    runtimeGranted && appEnabled && incomingChannelEnabled && !appBlocked && effectiveState === "GRANTED";

  const lockScreenIncomingReady =
    receiveReady && settings.fullScreenIntentAllowed && battery !== "restricted";

  return {
    effectiveState: receiveReady ? "GRANTED" : effectiveState,
    notificationRuntimePermission: runtimeGranted,
    appNotificationsEnabled: appEnabled,
    incomingCallChannelEnabled: incomingChannelEnabled,
    fullScreenIntentEnabled: settings.fullScreenIntentAllowed,
    batteryUnrestrictedOrUnknown: battery,
    samsungSleepRisk: "unknown",
    receiveReady,
    lockScreenIncomingReady,
    blockReason: receiveReady ? undefined : blockReason,
    manufacturer: settings.manufacturer ?? null,
    syncedAt: Date.now(),
  };
}

/** LOCK — sole Android POST_NOTIFICATIONS request path (via adapter). */
export async function requestAndroidNotificationRuntimePermission(): Promise<
  "granted" | "denied" | "prompt" | "skipped"
> {
  if (!shouldUseAndroidNativeDevicePermissionBridge()) return "skipped";
  const current = await checkAndroidNativeDevicePermission("notification");
  if (current === "granted" || current === "denied") return current;
  const requested = await requestAndroidNativeDevicePermission("notification");
  if (requested === "granted") return "granted";
  if (requested === "denied") return "denied";
  return "prompt";
}
