"use client";

import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import { checkAndroidFullScreenIntentGranted } from "@/lib/push/native/check-android-full-screen-intent";
import { openFullScreenIntentSettings } from "@/lib/permissions/permission-manager/notification-permission-manager";
import { getBoundAuthUserId } from "@/lib/auth/client-instance-id";

const FSI_POST_LOGIN_NUDGE_KEY = "dibay_fsi_post_login_settings_nudged";
/**
 * B5 — "post-login" nudge = once per login on this device (legacy receive policy: Post-login
 * OS Notification → FSI 확인 → OFF 시 OS 설정). sessionStorage alone dies with the process, so a
 * member was sent to OS settings on every cold start. localStorage key is user-scoped and removed by
 * the logout / account-switch wipe (ephemeral localStorage), so the next login nudges again.
 */
const FSI_POST_LOGIN_NUDGE_LOCAL_PREFIX = "dibay:fsi:post-login-nudged:";

function loginNudgeLocalKey(): string | null {
  const uid = getBoundAuthUserId()?.trim();
  return uid ? `${FSI_POST_LOGIN_NUDGE_LOCAL_PREFIX}${uid}` : null;
}

function readLoginNudged(): boolean {
  const key = loginNudgeLocalKey();
  if (!key || typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markLoginNudged(): void {
  const key = loginNudgeLocalKey();
  if (!key || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* storage unavailable: sessionStorage guard still applies */
  }
}

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

  if (
    (typeof sessionStorage !== "undefined" && sessionStorage.getItem(FSI_POST_LOGIN_NUDGE_KEY) === "1") ||
    readLoginNudged()
  ) {
    console.info("[device-permission] post_login_fsi_check", { result: "skipped_already_nudged" });
    return "skipped";
  }

  const opened = await openFullScreenIntentSettings();
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(FSI_POST_LOGIN_NUDGE_KEY, "1");
  }
  markLoginNudged();
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
