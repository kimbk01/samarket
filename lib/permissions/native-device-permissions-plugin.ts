"use client";

import { registerPlugin } from "@capacitor/core";
import type { DevicePermissionKind } from "@/lib/permissions/device-permission-kind";
import {
  isCapacitorBridgeReady,
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
  waitForCapacitorBridgeReady,
} from "@/lib/platform/capacitor-native";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

export const NATIVE_DEVICE_PERMISSIONS_PLUGIN_ID = "NativeDevicePermissions";

export type NativeDevicePermissionJsState = "granted" | "denied" | "prompt";

export type AndroidCallReceiveSettings = {
  notificationRuntimeGranted: boolean;
  notificationsEnabled: boolean;
  incomingChannelId: string;
  incomingChannelImportance: number;
  incomingChannelBlocked: boolean;
  fullScreenIntentAllowed: boolean;
  deviceIdleMode: boolean;
  shouldShowCallReceiveGuide: boolean;
};

export type NativeDevicePermissionsPlugin = {
  checkPermission(options: { kind: DevicePermissionKind }): Promise<{ kind: DevicePermissionKind; state: NativeDevicePermissionJsState }>;
  requestPermission(options: { kind: DevicePermissionKind }): Promise<{ kind: DevicePermissionKind; state: NativeDevicePermissionJsState }>;
  requestCallMediaPermissions(options: {
    callKind: CommunityMessengerCallKind;
  }): Promise<{ callKind: CommunityMessengerCallKind; state: NativeDevicePermissionJsState }>;
  openAppSettings(): Promise<{ opened: boolean }>;
  checkFullScreenIntent(): Promise<{ granted: boolean }>;
  openFullScreenIntentSettings(): Promise<{ opened: boolean }>;
  checkCallReceiveSettings(): Promise<AndroidCallReceiveSettings>;
};

const NativeDevicePermissions = registerPlugin<NativeDevicePermissionsPlugin>(
  NATIVE_DEVICE_PERMISSIONS_PLUGIN_ID,
);

function invokeNativeDevicePermissionsPlugin<T>(
  method:
    | "checkPermission"
    | "requestPermission"
    | "requestCallMediaPermissions"
    | "openAppSettings"
    | "checkCallReceiveSettings",
  options?: { kind?: DevicePermissionKind; callKind?: CommunityMessengerCallKind },
): Promise<T> {
  const cap = (typeof window !== "undefined" ? window : undefined) as Window & {
    Capacitor?: { nativePromise?: (plugin: string, methodName: string, options?: unknown) => Promise<unknown> };
  };
  const nativePromise = cap?.Capacitor?.nativePromise;
  if (typeof nativePromise === "function" && isCapacitorBridgeReady()) {
    return nativePromise(NATIVE_DEVICE_PERMISSIONS_PLUGIN_ID, method, options ?? {}) as Promise<T>;
  }
  if (method === "checkPermission" && options?.kind) {
    return NativeDevicePermissions.checkPermission({ kind: options.kind }) as Promise<T>;
  }
  if (method === "requestPermission" && options?.kind) {
    return NativeDevicePermissions.requestPermission({ kind: options.kind }) as Promise<T>;
  }
  if (method === "requestCallMediaPermissions" && options?.callKind) {
    return NativeDevicePermissions.requestCallMediaPermissions({ callKind: options.callKind }) as Promise<T>;
  }
  if (method === "openAppSettings") {
    return NativeDevicePermissions.openAppSettings() as Promise<T>;
  }
  if (method === "checkCallReceiveSettings") {
    return NativeDevicePermissions.checkCallReceiveSettings() as Promise<T>;
  }
  throw new Error("Native device permissions bridge unavailable");
}

async function ensureAndroidNativePermissionsBridgeReady(): Promise<boolean> {
  if (!shouldUseAndroidNativeDevicePermissionBridge()) return false;
  if (isCapacitorBridgeReady()) return true;
  return waitForCapacitorBridgeReady({ timeoutMs: 3_500 });
}

export function shouldUseAndroidNativeDevicePermissionBridge(): boolean {
  return isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "android";
}

export async function checkAndroidNativeDevicePermission(
  kind: DevicePermissionKind,
): Promise<NativeDevicePermissionJsState | null> {
  if (!shouldUseAndroidNativeDevicePermissionBridge()) return null;
  if (!(await ensureAndroidNativePermissionsBridgeReady())) return null;
  try {
    const result = await invokeNativeDevicePermissionsPlugin<{
      kind: DevicePermissionKind;
      state: NativeDevicePermissionJsState;
    }>("checkPermission", { kind });
    return result.state ?? null;
  } catch {
    return null;
  }
}

export async function requestAndroidNativeDevicePermission(
  kind: DevicePermissionKind,
): Promise<NativeDevicePermissionJsState | null> {
  if (!shouldUseAndroidNativeDevicePermissionBridge()) return null;
  if (!(await ensureAndroidNativePermissionsBridgeReady())) return null;
  try {
    const result = await invokeNativeDevicePermissionsPlugin<{
      kind: DevicePermissionKind;
      state: NativeDevicePermissionJsState;
    }>("requestPermission", { kind });
    return result.state ?? null;
  } catch {
    return null;
  }
}

/** 통화 전용 — mic 또는 mic+camera OS 팝업을 한 번에 요청 */
export async function requestAndroidNativeCallMediaPermissions(
  callKind: CommunityMessengerCallKind,
): Promise<NativeDevicePermissionJsState | null> {
  if (!shouldUseAndroidNativeDevicePermissionBridge()) return null;
  if (!(await ensureAndroidNativePermissionsBridgeReady())) return null;
  try {
    const result = await invokeNativeDevicePermissionsPlugin<{
      callKind: CommunityMessengerCallKind;
      state: NativeDevicePermissionJsState;
    }>("requestCallMediaPermissions", { callKind });
    return result.state ?? null;
  } catch {
    return null;
  }
}

export async function openAndroidNativeAppSettings(): Promise<boolean> {
  if (!shouldUseAndroidNativeDevicePermissionBridge()) return false;
  try {
    const result = await invokeNativeDevicePermissionsPlugin<{ opened: boolean }>("openAppSettings");
    return Boolean(result.opened);
  } catch {
    return false;
  }
}

export async function checkAndroidCallReceiveSettings(): Promise<AndroidCallReceiveSettings | null> {
  if (!shouldUseAndroidNativeDevicePermissionBridge()) return null;
  if (!(await ensureAndroidNativePermissionsBridgeReady())) return null;
  try {
    return await invokeNativeDevicePermissionsPlugin<AndroidCallReceiveSettings>("checkCallReceiveSettings");
  } catch {
    return null;
  }
}

export function mapNativeDevicePermissionToBrowserState(
  state: NativeDevicePermissionJsState | null,
): "granted" | "denied" | "prompt" | "unknown" {
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  if (state === "prompt") return "prompt";
  return "unknown";
}
