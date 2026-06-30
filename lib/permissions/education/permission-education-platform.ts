"use client";

import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import type { PermissionEducationContext } from "@/lib/permissions/education/permission-education-types";

/** Android/iOS Capacitor shell — excludes plain web and Windows browser shell. */
export function isMobileNativePlatform(): boolean {
  if (!isCapacitorNativePlatform()) return false;
  const shell = resolveCapacitorShellPlatform();
  return shell === "android" || shell === "ios";
}

export function supportsNativeSettingsShortcut(): boolean {
  return isMobileNativePlatform();
}

/** Plain web / Windows — browser mic/camera permission guidance only. */
export function supportsBrowserMediaPermission(): boolean {
  return !isMobileNativePlatform();
}

export function supportsPermissionEducationContext(_context: PermissionEducationContext): boolean {
  return true;
}
