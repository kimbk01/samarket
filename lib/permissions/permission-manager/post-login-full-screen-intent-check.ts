"use client";

import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import { checkAndroidFullScreenIntentGranted } from "@/lib/push/native/check-android-full-screen-intent";
import { openFullScreenIntentSettings } from "@/lib/permissions/permission-manager/notification-permission-manager";

const FSI_POST_LOGIN_NUDGE_KEY = "dibay_fsi_post_login_settings_nudged";

export type PostLoginFullScreenIntentCheckResult = "granted" | "opened_settings" | "skipped" | "unknown";

/**
 * Post-login FSI tier — status check only; no DIBAY app modal.
 * When FSI is off, opens OS full-screen intent settings directly (user may dismiss).
 * Does not block Runtime receive (lockScreenIncomingReady tier only).
 */
export async function runPostLoginFullScreenIntentCheck(): Promise<PostLoginFullScreenIntentCheckResult> {
  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "android") {
    return "skipped";
  }

  const granted = await checkAndroidFullScreenIntentGranted();
  if (granted === true) {
    return "granted";
  }
  if (granted !== false) {
    return "unknown";
  }

  if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(FSI_POST_LOGIN_NUDGE_KEY) === "1") {
    console.info("[device-permission] post_login_fsi_check", { result: "skipped_already_nudged" });
    return "skipped";
  }

  const opened = await openFullScreenIntentSettings();
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(FSI_POST_LOGIN_NUDGE_KEY, "1");
  }
  console.info("[device-permission] post_login_fsi_check", {
    result: opened ? "opened_settings" : "skipped",
    lockScreenIncomingReady: false,
  });
  return opened ? "opened_settings" : "skipped";
}

/** Test-only reset for session nudge gate. */
export function resetPostLoginFullScreenIntentCheckForTests(): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(FSI_POST_LOGIN_NUDGE_KEY);
  }
}
