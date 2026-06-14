"use client";

import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

/** OS 앱 설정 화면 — 권한 거부 시 안내용. */
export async function openNativeAppSettings(): Promise<boolean> {
  if (!isCapacitorNativePlatform()) return false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    const platform = Capacitor.getPlatform();
    if (platform === "ios") {
      window.location.href = "app-settings:";
      return true;
    }
    if (platform === "android") {
      window.location.href =
        "intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;scheme=package;package=com.dibay.app;end";
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
