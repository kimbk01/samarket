"use client";

import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import type {
  PermissionCapabilityItemId,
  PermissionEducationContext,
} from "@/lib/permissions/education/permission-education-types";

/** Android/iOS Capacitor shell — excludes plain web and Windows browser shell. */
export function isMobileNativePlatform(): boolean {
  if (!isCapacitorNativePlatform()) return false;
  const shell = resolveCapacitorShellPlatform();
  return shell === "android" || shell === "ios";
}

export function supportsFullScreenIntent(): boolean {
  return isMobileNativePlatform() && resolveCapacitorShellPlatform() === "android";
}

export function supportsBatteryOptimizationGuide(): boolean {
  return isMobileNativePlatform() && resolveCapacitorShellPlatform() === "android";
}

export function supportsOemGuide(): boolean {
  return supportsBatteryOptimizationGuide();
}

export function supportsNativeSettingsShortcut(): boolean {
  return isMobileNativePlatform();
}

export function supportsLockScreenIncomingEducation(): boolean {
  return isMobileNativePlatform();
}

/** Plain web / Windows — browser mic/camera permission guidance only. */
export function supportsBrowserMediaPermission(): boolean {
  return !isMobileNativePlatform();
}

export const MOBILE_ONLY_CAPABILITY_IDS: readonly PermissionCapabilityItemId[] = [
  "lock_screen_incoming",
  "full_screen_intent",
  "battery",
];

export function filterCapabilityItemsForPlatform<T extends { id: PermissionCapabilityItemId }>(
  items: T[],
): T[] {
  if (isMobileNativePlatform()) return items;
  return items.filter((item) => !MOBILE_ONLY_CAPABILITY_IDS.includes(item.id));
}

export function supportsPermissionEducationContext(context: PermissionEducationContext): boolean {
  if (context.tier === "lock_screen_fsi") {
    return supportsLockScreenIncomingEducation() && supportsFullScreenIntent();
  }
  if (context.tier === "battery_restricted") {
    return supportsBatteryOptimizationGuide();
  }
  return true;
}
