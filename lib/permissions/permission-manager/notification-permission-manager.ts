"use client";

import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import {
  readAndroidNotificationReceiveSnapshot,
  requestAndroidNotificationRuntimePermission,
} from "@/lib/permissions/permission-manager/adapters/android-native.adapter";
import {
  readIosNotificationReceiveSnapshot,
  requestIosNotificationRuntimePermission,
} from "@/lib/permissions/permission-manager/adapters/ios-capacitor.adapter";
import {
  readWebNotificationReceiveSnapshot,
  requestWebNotificationRuntimePermission,
} from "@/lib/permissions/permission-manager/adapters/web-notification.adapter";
import {
  clearNotificationRequiredBlocked,
  markNotificationRequiredBlocked,
  readNotificationRequiredBlocked,
} from "@/lib/permissions/permission-manager/notification-permission-block-store";
import type {
  NotificationOsRequestResult,
  NotificationPermissionState,
  NotificationReceiveSnapshot,
} from "@/lib/permissions/permission-manager/notification-permission-types";
import { openAndroidNativeAppSettings } from "@/lib/permissions/native-device-permissions-plugin";
import { openNativeAppSettings } from "@/lib/push/native/open-native-settings";

let cachedSnapshot: NotificationReceiveSnapshot | null = null;
let lastReceiveReady = false;
const listeners = new Set<(snapshot: NotificationReceiveSnapshot) => void>();

/** Native bridge read dedupe — cold start·복귀 중복 IPC 완화 (push register LOCK 외부) */
const NATIVE_SYNC_TTL_MS = 8_000;
let lastNativeSyncAt = 0;
let syncInflight: Promise<NotificationReceiveSnapshot> | null = null;

export type SyncNotificationStateOptions = {
  /** OS prompt 직후 등 — TTL·inflight 합류 무시 */
  force?: boolean;
};

export function resetNotificationPermissionSyncForTests(): void {
  cachedSnapshot = null;
  lastReceiveReady = false;
  lastNativeSyncAt = 0;
  syncInflight = null;
  listeners.clear();
}

function notify(snapshot: NotificationReceiveSnapshot): void {
  for (const fn of listeners) {
    try {
      fn(snapshot);
    } catch {
      /* ignore */
    }
  }
}

export function subscribeNotificationPermissionSnapshot(
  cb: (snapshot: NotificationReceiveSnapshot) => void,
): () => void {
  listeners.add(cb);
  if (cachedSnapshot) {
    try {
      cb(cachedSnapshot);
    } catch {
      /* ignore */
    }
  }
  return () => {
    listeners.delete(cb);
  };
}

export function getCachedNotificationReceiveSnapshot(): NotificationReceiveSnapshot | null {
  return cachedSnapshot;
}

async function readPlatformSnapshot(appBlocked: boolean): Promise<NotificationReceiveSnapshot> {
  if (isCapacitorNativePlatform()) {
    const platform = resolveCapacitorShellPlatform();
    if (platform === "android") {
      const android = await readAndroidNotificationReceiveSnapshot(appBlocked);
      if (android) return android;
    }
    if (platform === "ios") {
      const ios = await readIosNotificationReceiveSnapshot(appBlocked);
      if (ios) return ios;
    }
  }
  return readWebNotificationReceiveSnapshot(appBlocked);
}

async function runSyncNotificationStateInternal(
  appBlocked: boolean,
): Promise<NotificationReceiveSnapshot> {
  const snapshot = await readPlatformSnapshot(appBlocked);

  if (snapshot.receiveReady && appBlocked) {
    clearNotificationRequiredBlocked();
    snapshot.blockReason = undefined;
  }

  const prevReady = lastReceiveReady;
  cachedSnapshot = snapshot;
  lastReceiveReady = snapshot.receiveReady;
  lastNativeSyncAt = Date.now();
  notify(snapshot);

  if (snapshot.receiveReady && !prevReady) {
    clearNotificationRequiredBlocked();
  }

  return snapshot;
}

/** Read-only OS/settings aggregate — single truth refresh. */
export async function syncNotificationState(
  opts?: SyncNotificationStateOptions,
): Promise<NotificationReceiveSnapshot> {
  const appBlocked = readNotificationRequiredBlocked();
  const now = Date.now();

  if (
    !opts?.force &&
    cachedSnapshot &&
    isCapacitorNativePlatform() &&
    now - lastNativeSyncAt < NATIVE_SYNC_TTL_MS
  ) {
    return cachedSnapshot;
  }

  if (!opts?.force && syncInflight) {
    return syncInflight;
  }

  const flight = runSyncNotificationStateInternal(appBlocked);
  syncInflight = flight;
  try {
    return await flight;
  } finally {
    if (syncInflight === flight) {
      syncInflight = null;
    }
  }
}

export function shouldShowNotificationGuide(snapshot: NotificationReceiveSnapshot): boolean {
  if (snapshot.receiveReady) return false;
  if (snapshot.effectiveState === "NOT_SUPPORTED") return false;
  return true;
}

export function canRequestOsNotificationPrompt(snapshot: NotificationReceiveSnapshot): boolean {
  if (snapshot.effectiveState === "PERMANENT_DENIED") return false;
  if (snapshot.effectiveState === "SYSTEM_DISABLED") return false;
  if (snapshot.notificationRuntimePermission) return false;
  return snapshot.effectiveState === "UNKNOWN" || snapshot.effectiveState === "DENIED";
}

/** FCM / incoming — check only, no request. */
export async function checkIncomingCallReceive(): Promise<NotificationReceiveSnapshot> {
  return syncNotificationState();
}

/** Push register — check only. */
export async function ensureNotificationForPushRegister(): Promise<{
  ok: boolean;
  snapshot: NotificationReceiveSnapshot;
}> {
  const snapshot = await syncNotificationState();
  return { ok: snapshot.receiveReady, snapshot };
}

/**
 * LOCK — app-wide sole OS notification request entry.
 * Call only after user confirms Notification Guide Modal.
 */
export async function requestNotificationFromGuide(): Promise<NotificationOsRequestResult> {
  let snapshot = await syncNotificationState();

  if (snapshot.receiveReady) {
    clearNotificationRequiredBlocked();
    return { ok: true, snapshot };
  }

  if (!canRequestOsNotificationPrompt(snapshot)) {
    if (snapshot.effectiveState === "SYSTEM_DISABLED" || snapshot.effectiveState === "PERMANENT_DENIED") {
      markNotificationRequiredBlocked();
    }
    return {
      ok: false,
      snapshot,
      reason: snapshot.effectiveState === "SYSTEM_DISABLED" ? "blocked" : "denied",
    };
  }

  let osResult: "granted" | "denied" | "prompt" | "skipped" = "skipped";
  if (isCapacitorNativePlatform()) {
    const platform = resolveCapacitorShellPlatform();
    if (platform === "android") {
      osResult = await requestAndroidNotificationRuntimePermission();
    } else if (platform === "ios") {
      osResult = await requestIosNotificationRuntimePermission();
    }
  } else {
    osResult = await requestWebNotificationRuntimePermission();
  }

  snapshot = await syncNotificationState({ force: true });

  if (osResult === "granted" && snapshot.receiveReady) {
    clearNotificationRequiredBlocked();
    return { ok: true, snapshot };
  }

  if (osResult === "denied" || snapshot.effectiveState === "PERMANENT_DENIED") {
    markNotificationRequiredBlocked();
    return { ok: false, snapshot, reason: "denied" };
  }

  if (snapshot.effectiveState === "SYSTEM_DISABLED") {
    markNotificationRequiredBlocked();
    return { ok: false, snapshot, reason: "blocked" };
  }

  markNotificationRequiredBlocked();
  return { ok: false, snapshot, reason: "deferred" };
}

export async function openNotificationSettings(): Promise<boolean> {
  if (isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "android") {
    return openAndroidNativeAppSettings();
  }
  return openNativeAppSettings();
}

export async function openFullScreenIntentSettings(): Promise<boolean> {
  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "android") return false;
  try {
    const cap = (typeof window !== "undefined" ? window : undefined) as Window & {
      Capacitor?: { nativePromise?: (plugin: string, methodName: string, options?: unknown) => Promise<unknown> };
    };
    const nativePromise = cap?.Capacitor?.nativePromise;
    if (typeof nativePromise === "function") {
      const result = (await nativePromise("NativeDevicePermissions", "openFullScreenIntentSettings", {})) as {
        opened?: boolean;
      };
      return Boolean(result.opened);
    }
  } catch {
    /* fall through */
  }
  return false;
}

export async function openBatteryOptimizationSettings(): Promise<boolean> {
  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "android") return false;
  try {
    window.location.href =
      "intent:#Intent;action=android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS;end";
    return true;
  } catch {
    return false;
  }
}

export function isSamsungDevice(snapshot: NotificationReceiveSnapshot | null): boolean {
  const m = snapshot?.manufacturer?.trim().toLowerCase() ?? "";
  return m.includes("samsung");
}

export function describeNotificationState(state: NotificationPermissionState): string {
  return state;
}
