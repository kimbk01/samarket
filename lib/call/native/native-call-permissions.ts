"use client";

import { registerPlugin } from "@capacitor/core";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { invokeNativeCallServicePlugin } from "@/lib/call/native/native-call-service";
import {
  checkAndroidNativeDevicePermission,
  openAndroidNativeAppSettings,
  requestAndroidNativeCallMediaPermissions,
  requestAndroidNativeDevicePermission,
  shouldUseAndroidNativeDevicePermissionBridge,
} from "@/lib/permissions/native-device-permissions-plugin";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import type { CallOsPermissionSnapshot } from "@/lib/call/permissions/call-permission-types";

export const CALL_PERMISSION_PLUGIN_ID = "CallPermission";

export type CallPermissionPlugin = {
  checkPermissions(): Promise<{ microphone: string; camera: string }>;
  requestCallMediaPermissions(options: { callKind: CommunityMessengerCallKind }): Promise<{
    callKind: CommunityMessengerCallKind;
    microphone: string;
    camera: string;
  }>;
  openAppSettings(): Promise<{ opened: boolean }>;
};

const CallPermission = registerPlugin<CallPermissionPlugin>(CALL_PERMISSION_PLUGIN_ID);

function mapOsState(state: string | null | undefined): CallOsPermissionSnapshot["microphone"] {
  if (state === "granted") return "granted";
  if (state === "prompt_available") return "prompt_available";
  if (state === "permanently_denied") return "permanently_denied";
  if (state === "denied") return "permanently_denied";
  if (state === "prompt") return "prompt_available";
  return "unknown";
}

async function checkViaCallPermissionPlugin(): Promise<CallOsPermissionSnapshot | null> {
  if (!shouldUseAndroidNativeDevicePermissionBridge()) return null;
  try {
    const result = await CallPermission.checkPermissions();
    return {
      microphone: mapOsState(result.microphone),
      camera: mapOsState(result.camera),
    };
  } catch {
    return null;
  }
}

async function checkViaLegacyBridge(): Promise<CallOsPermissionSnapshot> {
  const [mic, cam] = await Promise.all([
    checkAndroidNativeDevicePermission("microphone"),
    checkAndroidNativeDevicePermission("camera"),
  ]);
  return {
    microphone: mapOsState(mic),
    camera: mapOsState(cam),
  };
}

async function checkViaIosNativeBridge(): Promise<CallOsPermissionSnapshot | null> {
  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "ios") return null;
  try {
    const result = await invokeNativeCallServicePlugin<{ microphone: string; camera: string }>(
      "checkCallMediaPermissions",
    );
    if (!result) return null;
    return {
      microphone: mapOsState(result.microphone),
      camera: mapOsState(result.camera),
    };
  } catch {
    return null;
  }
}

/** Android native permission check — store 값보다 우선 */
export async function checkNativeCallOsPermissions(): Promise<CallOsPermissionSnapshot> {
  const iosResult = await checkViaIosNativeBridge();
  if (iosResult) return iosResult;
  const pluginResult = await checkViaCallPermissionPlugin();
  if (pluginResult) return pluginResult;
  if (shouldUseAndroidNativeDevicePermissionBridge()) {
    return checkViaLegacyBridge();
  }
  if (typeof navigator !== "undefined" && navigator.permissions?.query) {
    try {
      const [mic, cam] = await Promise.all([
        navigator.permissions.query({ name: "microphone" as PermissionName }),
        navigator.permissions.query({ name: "camera" as PermissionName }),
      ]);
      return {
        microphone: mapOsState(mic.state),
        camera: mapOsState(cam.state),
      };
    } catch {
      /* fall through */
    }
  }
  return { microphone: "unknown", camera: "unknown" };
}

export async function requestNativeCallMediaPermissions(
  callKind: CommunityMessengerCallKind,
  callId?: string,
): Promise<CallOsPermissionSnapshot> {
  if (isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "ios") {
    const sid = callId?.trim() ?? "permission_probe";
    try {
      const result = await invokeNativeCallServicePlugin<{
        ok: boolean;
        microphone: string;
        camera: string;
      }>("requestCallMediaPermissions", { callId: sid, callKind });
      if (result) {
        return {
          microphone: mapOsState(result.microphone),
          camera: mapOsState(result.camera),
        };
      }
    } catch {
      /* fall through to GUM probe */
    }
  }
  if (shouldUseAndroidNativeDevicePermissionBridge()) {
    try {
      const pluginResult = await CallPermission.requestCallMediaPermissions({ callKind });
      return {
        microphone: mapOsState(pluginResult.microphone),
        camera: mapOsState(pluginResult.camera),
      };
    } catch {
      const legacy = await requestAndroidNativeCallMediaPermissions(callKind);
      if (legacy === "granted") {
        return checkNativeCallOsPermissions();
      }
    }
    if (callKind === "voice") {
      await requestAndroidNativeDevicePermission("microphone");
    }
    return checkNativeCallOsPermissions();
  }
  // iOS / web fallback — no native plugin bridge here, so the real OS permission
  // dialog only fires if we actually call getUserMedia() ourselves. Without this,
  // iOS never shows the system mic prompt and Settings never gets an entry for the app.
  if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callKind === "video",
      });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      // Denied, dismissed, or errored — fall through and let the re-check below
      // report the real resulting OS state (denied vs still-prompt-available).
    }
  }
  return checkNativeCallOsPermissions();
}

export async function openNativeCallPermissionSettings(): Promise<boolean> {
  if (shouldUseAndroidNativeDevicePermissionBridge()) {
    try {
      const result = await CallPermission.openAppSettings();
      if (result.opened) return true;
    } catch {
      /* fall through */
    }
    return openAndroidNativeAppSettings();
  }
  return false;
}
