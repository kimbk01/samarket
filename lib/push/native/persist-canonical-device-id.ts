"use client";

import { invokeNativeCallServicePlugin } from "@/lib/call/native/native-call-service";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

/**
 * Persist `user_devices.device_id` into Native prefs so accept claim /
 * answered_elsewhere use the same id as push fan-out (not ANDROID_ID / IDFV).
 */
export async function persistCanonicalDeviceIdToNative(deviceId: string): Promise<void> {
  const id = String(deviceId ?? "").trim();
  if (!id || !isCapacitorNativePlatform()) return;
  try {
    await invokeNativeCallServicePlugin("persistCanonicalDeviceId", { deviceId: id });
  } catch {
    /* best-effort — accept may still resolve from WebView localStorage on iOS */
  }
}
