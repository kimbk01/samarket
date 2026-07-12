"use client";

import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import {
  openBatteryOptimizationSettings,
  syncNotificationState,
} from "@/lib/permissions/permission-manager/notification-permission-manager";

const BATTERY_CALL_BOUNDARY_NUDGE_KEY = "dibay_battery_call_boundary_settings_nudged";

export type CallBoundaryBatteryCheckResult = "granted" | "opened_settings" | "skipped" | "unknown";

/**
 * Call-boundary battery tier — legacy OS-first (no DIBAY modal).
 * When receiveReady but battery is restricted, opens OS battery settings (session nudge once).
 * Does not block Runtime receive (lockScreenIncomingReady tier only).
 */
export async function runCallBoundaryBatteryOptimizationCheck(): Promise<CallBoundaryBatteryCheckResult> {
  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "android") {
    return "skipped";
  }

  const snapshot = await syncNotificationState();
  if (!snapshot.receiveReady) {
    return "skipped";
  }
  if (snapshot.batteryUnrestrictedOrUnknown !== "restricted") {
    return snapshot.lockScreenIncomingReady ? "granted" : "unknown";
  }

  if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(BATTERY_CALL_BOUNDARY_NUDGE_KEY) === "1") {
    console.info("[device-permission] call_boundary_battery_check", { result: "skipped_already_nudged" });
    return "skipped";
  }

  const opened = await openBatteryOptimizationSettings();
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(BATTERY_CALL_BOUNDARY_NUDGE_KEY, "1");
  }
  console.info("[device-permission] call_boundary_battery_check", {
    result: opened ? "opened_settings" : "skipped",
    lockScreenIncomingReady: snapshot.lockScreenIncomingReady,
  });
  return opened ? "opened_settings" : "skipped";
}

/** Test-only reset for session nudge gate. */
export function resetCallBoundaryBatteryOptimizationCheckForTests(): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(BATTERY_CALL_BOUNDARY_NUDGE_KEY);
  }
}
