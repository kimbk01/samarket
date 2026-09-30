import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

/**
 * Product OS Start runtime targets: Android + iOS Capacitor only.
 * Web / Windows → DIRECT COMMUNITY (no OsEntry surface).
 */
export function shouldRunOsEntryRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return isCapacitorNativePlatform();
}
