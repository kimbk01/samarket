"use client";

import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import { checkAndroidFullScreenIntentGranted } from "@/lib/push/native/check-android-full-screen-intent";

export type PostLoginFullScreenIntentCheckResult = "granted" | "opened_settings" | "skipped" | "unknown";

/**
 * Post-login FSI tier — status check only. Does not open OS settings automatically.
 */
export async function runPostLoginFullScreenIntentCheck(): Promise<PostLoginFullScreenIntentCheckResult> {
  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "android") {
    return "skipped";
  }

  const granted = await checkAndroidFullScreenIntentGranted();
  if (granted === true) {
    return "granted";
  }
  if (granted === false) {
    console.info("[device-permission] post_login_fsi_check", { result: "skipped_not_granted" });
    return "skipped";
  }
  return "unknown";
}

/** @deprecated session nudge removed — kept for test import stability */
export function resetPostLoginFullScreenIntentCheckForTests(): void {
  /* no-op */
}
