/**
 * FD3 application orientation contract.
 *
 * Native enforcement consumes FD1 DeviceClass before WebView first frame.
 * This module is the product contract + unit surface. It is not a delayed JS locker.
 *
 * WindowClass band numbers and domain floors stay CANDIDATE_NOT_LOCKED (FD2).
 */

import type { DibayDeviceClass } from "@/lib/device/dibay-device-class";

export type DibayOrientationPolicy =
  | "PORTRAIT_ONLY"
  | "PORTRAIT_AND_LANDSCAPE"
  | "RESIZABLE_DESKTOP"
  | "UNKNOWN_SAFE";

export function orientationPolicyForDeviceClass(deviceClass: DibayDeviceClass): DibayOrientationPolicy {
  if (deviceClass === "PHONE_ANDROID" || deviceClass === "PHONE_IOS") return "PORTRAIT_ONLY";
  if (deviceClass === "TABLET_ANDROID" || deviceClass === "TABLET_IPAD") return "PORTRAIT_AND_LANDSCAPE";
  if (deviceClass === "DESKTOP_WINDOWS" || deviceClass === "WEB_DESKTOP") return "RESIZABLE_DESKTOP";
  return "UNKNOWN_SAFE";
}

/** Android MainActivity may request portrait only for PHONE_ANDROID. */
export function shouldRequestAndroidAppPortrait(deviceClass: DibayDeviceClass): boolean {
  return deviceClass === "PHONE_ANDROID";
}

/** iOS root VC may lock the interface mask to portrait only for PHONE_IOS. */
export function shouldLockIosAppPortrait(deviceClass: DibayDeviceClass): boolean {
  return deviceClass === "PHONE_IOS";
}
