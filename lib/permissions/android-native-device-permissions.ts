import type { DevicePermissionKind } from "@/lib/permissions/device-permission-kind";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import type { BrowserPermissionState } from "@/lib/permissions/device-permission-manager";
import {
  checkAndroidNativeDevicePermission,
  mapNativeDevicePermissionToBrowserState,
  requestAndroidNativeCallMediaPermissions,
  requestAndroidNativeDevicePermission,
  shouldUseAndroidNativeDevicePermissionBridge,
} from "@/lib/permissions/native-device-permissions-plugin";

/**
 * Android Capacitor WebView — Permissions API 가 unknown 인 경우 네이티브 상태를 우선한다.
 */
export async function resolveAndroidNativePermissionBrowserState(
  kind: DevicePermissionKind,
): Promise<BrowserPermissionState | null> {
  if (!shouldUseAndroidNativeDevicePermissionBridge()) return null;
  const native = await checkAndroidNativeDevicePermission(kind);
  const mapped = mapNativeDevicePermissionToBrowserState(native);
  return mapped === "unknown" ? null : mapped;
}

/**
 * DiBaY 게이트 통과 직후 — OS 런타임 권한 다이얼로그 (카톡·배민형: 앱 안내 → OS 팝업).
 * @returns granted | denied | skipped(웹·iOS)
 */
export async function ensureAndroidNativeRuntimePermission(
  kind: DevicePermissionKind,
): Promise<"granted" | "denied" | "skipped"> {
  if (!shouldUseAndroidNativeDevicePermissionBridge()) return "skipped";

  const current = await checkAndroidNativeDevicePermission(kind);
  if (current === "granted") return "granted";

  const requested = await requestAndroidNativeDevicePermission(kind);
  if (requested === null) return "skipped";
  if (requested === "granted") return "granted";
  return "denied";
}

/**
 * Android APK 통화 — Agora/GUM 직전 mic·camera OS 권한 (일괄 팝업).
 */
export async function ensureAndroidNativeCallMediaPermissions(
  callKind: CommunityMessengerCallKind,
): Promise<"granted" | "denied" | "skipped"> {
  if (!shouldUseAndroidNativeDevicePermissionBridge()) return "skipped";

  const micState = await checkAndroidNativeDevicePermission("microphone");
  const camOk =
    callKind !== "video" || (await checkAndroidNativeDevicePermission("camera")) === "granted";

  if (micState === "granted" && camOk) return "granted";

  const requested = await requestAndroidNativeCallMediaPermissions(callKind);
  if (requested === null) return "skipped";
  if (requested === "granted") return "granted";
  return "denied";
}

export async function ensureAndroidNativeRuntimePermissions(
  kinds: readonly DevicePermissionKind[],
): Promise<"granted" | "denied" | "skipped"> {
  if (!shouldUseAndroidNativeDevicePermissionBridge()) return "skipped";
  const unique = [...new Set(kinds)];
  for (const kind of unique) {
    const result = await ensureAndroidNativeRuntimePermission(kind);
    if (result === "denied") return "denied";
  }
  return "granted";
}
