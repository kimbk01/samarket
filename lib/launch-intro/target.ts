/**
 * DIBAY Intro — device target (expansion P7). Pure.
 *
 * DeviceClass is a protected domain: this module only READS its result type. The device runtime
 * resolves the class once in PREPARING (async native read, the same SSOT the app shell uses) —
 * never in the synchronous startup decision, where native DeviceClass is not available yet.
 * UNKNOWN never matches a specific target (no guessing from width).
 */
import type { DibayDeviceClass } from "@/lib/device/dibay-device-class";

export type LaunchIntroTarget = "all" | "phone" | "tablet";
export const LAUNCH_INTRO_TARGETS: readonly LaunchIntroTarget[] = ["all", "phone", "tablet"];

export function launchIntroTargetMatches(target: LaunchIntroTarget, deviceClass: DibayDeviceClass): boolean {
  if (target === "all") return true;
  if (target === "phone") return deviceClass === "PHONE_ANDROID" || deviceClass === "PHONE_IOS";
  return deviceClass === "TABLET_ANDROID" || deviceClass === "TABLET_IPAD";
}
