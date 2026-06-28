"use client";

import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

/** Track ① — Legacy Web Call establishment removed on Android Capacitor (Native SSOT). */
export function isLegacyWebCallEstablishmentRemoved(): boolean {
  return isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "android";
}
