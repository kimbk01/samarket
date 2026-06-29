/** LOCK — 6-state notification permission model (SSOT). */
export type NotificationPermissionState =
  | "UNKNOWN"
  | "GRANTED"
  | "DENIED"
  | "PERMANENT_DENIED"
  | "SYSTEM_DISABLED"
  | "NOT_SUPPORTED";

export type BatteryUnrestrictedState = "unrestricted" | "restricted" | "unknown";

/** Deep Sleep / Sleeping apps — no reliable OEM API; always unknown. */
export type SamsungSleepRisk = "unknown";

export type NotificationReceiveSnapshot = {
  effectiveState: NotificationPermissionState;
  notificationRuntimePermission: boolean;
  appNotificationsEnabled: boolean;
  incomingCallChannelEnabled: boolean;
  fullScreenIntentEnabled: boolean;
  batteryUnrestrictedOrUnknown: BatteryUnrestrictedState;
  samsungSleepRisk: SamsungSleepRisk;
  receiveReady: boolean;
  lockScreenIncomingReady: boolean;
  blockReason?: string;
  /** Android manufacturer lowercase when known */
  manufacturer?: string | null;
  syncedAt: number;
};

export type NotificationGuideMode = "first_login" | "disabled_resume" | "settings_retry";

export type NotificationGuideRequest = {
  mode: NotificationGuideMode;
  snapshot: NotificationReceiveSnapshot;
};

export type NotificationOsRequestResult =
  | { ok: true; snapshot: NotificationReceiveSnapshot }
  | { ok: false; snapshot: NotificationReceiveSnapshot; reason: "denied" | "blocked" | "not_supported" | "deferred" };
