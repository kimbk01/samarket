/**
 * FD2 layout-mode resolver foundation.
 *
 * Consumes FD1 DeviceClass as READ-ONLY identity.
 * Consumes FD2 usable window + domain floors as geometry.
 *
 * Does not wire Community / Trade / Messenger / Call UI.
 * Does not activate 3-pane.
 * Does not enforce orientation (FD3).
 */

import type { DibayDeviceClass } from "@/lib/device/dibay-device-class";
import {
  getDomainTwoPaneFloorPx,
  type DibayLayoutDomain,
} from "@/lib/device/dibay-domain-geometry";
import {
  classifyWindowClass,
  DIBAY_WINDOW_CLASS_LOCK_STATE,
  type DibayWindowClass,
} from "@/lib/device/dibay-window-class";

export type DibayLayoutSurface = "home" | "list" | "detail" | "room" | "call" | "unknown";

export type DibayOrientationInput = "portrait" | "landscape" | "unknown";

export type DibayLayoutMode =
  | "PHONE_SINGLE"
  | "TABLET_STACKED"
  | "TABLET_DUAL"
  | "DESKTOP_STACKED"
  | "DESKTOP_DUAL"
  | "DESKTOP_TRIPLE"
  | "CALL_PHONE"
  | "CALL_TABLET_PORTRAIT"
  | "CALL_TABLET_LANDSCAPE"
  | "CALL_DESKTOP"
  | "UNKNOWN_SAFE";

export type DibayLayoutFamily = "PHONE" | "TABLET" | "DESKTOP" | "CALL" | "UNKNOWN";

export type DibayLayoutResolverInput = {
  deviceClass: DibayDeviceClass;
  usableWidthPx: number;
  domain: DibayLayoutDomain;
  surface?: DibayLayoutSurface;
  orientation?: DibayOrientationInput;
  keyboardOpen?: boolean;
};

export type DibayLayoutResolverResult = {
  deviceClass: DibayDeviceClass;
  windowClass: DibayWindowClass;
  layoutMode: DibayLayoutMode;
  layoutFamily: DibayLayoutFamily;
  twoPaneFloorPx: number | null;
  paneCandidate: "single" | "dual" | "none";
  keyboardOpen: boolean;
  windowClassLockState: typeof DIBAY_WINDOW_CLASS_LOCK_STATE;
};

export function layoutFamilyForDeviceClass(deviceClass: DibayDeviceClass): Exclude<DibayLayoutFamily, "CALL"> {
  if (deviceClass === "PHONE_ANDROID" || deviceClass === "PHONE_IOS") return "PHONE";
  if (deviceClass === "TABLET_ANDROID" || deviceClass === "TABLET_IPAD") return "TABLET";
  if (deviceClass === "DESKTOP_WINDOWS" || deviceClass === "WEB_DESKTOP") return "DESKTOP";
  return "UNKNOWN";
}

export function resolveLayoutMode(input: DibayLayoutResolverInput): DibayLayoutResolverResult {
  const deviceClass = input.deviceClass;
  const windowClass = classifyWindowClass(input.usableWidthPx);
  const keyboardOpen = input.keyboardOpen === true;
  const deviceFamily = layoutFamilyForDeviceClass(deviceClass);

  if (deviceFamily === "UNKNOWN") {
    return finish({
      deviceClass,
      windowClass,
      layoutMode: "UNKNOWN_SAFE",
      layoutFamily: "UNKNOWN",
      twoPaneFloorPx: null,
      paneCandidate: "none",
      keyboardOpen,
    });
  }

  if (input.domain === "call") {
    return finish({
      deviceClass,
      windowClass,
      layoutMode: resolveCallLayoutMode(deviceFamily, input.orientation),
      layoutFamily: "CALL",
      twoPaneFloorPx: null,
      paneCandidate: "none",
      keyboardOpen,
    });
  }

  if (deviceFamily === "PHONE") {
    return finish({
      deviceClass,
      windowClass,
      layoutMode: "PHONE_SINGLE",
      layoutFamily: "PHONE",
      twoPaneFloorPx: getDomainTwoPaneFloorPx(input.domain),
      paneCandidate: "single",
      keyboardOpen,
    });
  }

  const twoPaneFloorPx = getDomainTwoPaneFloorPx(input.domain);
  const canDual = input.usableWidthPx >= twoPaneFloorPx;

  if (deviceFamily === "TABLET") {
    return finish({
      deviceClass,
      windowClass,
      layoutMode: canDual ? "TABLET_DUAL" : "TABLET_STACKED",
      layoutFamily: "TABLET",
      twoPaneFloorPx,
      paneCandidate: canDual ? "dual" : "single",
      keyboardOpen,
    });
  }

  return finish({
    deviceClass,
    windowClass,
    layoutMode: canDual ? "DESKTOP_DUAL" : "DESKTOP_STACKED",
    layoutFamily: "DESKTOP",
    twoPaneFloorPx,
    paneCandidate: canDual ? "dual" : "single",
    keyboardOpen,
  });
}

function resolveCallLayoutMode(
  deviceFamily: Exclude<DibayLayoutFamily, "CALL" | "UNKNOWN"> | "UNKNOWN",
  orientation: DibayOrientationInput | undefined,
): DibayLayoutMode {
  if (deviceFamily === "PHONE") return "CALL_PHONE";
  if (deviceFamily === "DESKTOP") return "CALL_DESKTOP";
  if (deviceFamily === "TABLET") {
    return orientation === "landscape" ? "CALL_TABLET_LANDSCAPE" : "CALL_TABLET_PORTRAIT";
  }
  return "UNKNOWN_SAFE";
}

function finish(
  result: Omit<DibayLayoutResolverResult, "windowClassLockState">,
): DibayLayoutResolverResult {
  return {
    ...result,
    windowClassLockState: DIBAY_WINDOW_CLASS_LOCK_STATE,
  };
}
