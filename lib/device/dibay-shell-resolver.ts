/**
 * FD4 App Shell / Navigation authority.
 *
 * Consumes FD1 DeviceClass as identity.
 * Consumes FD2 LayoutMode as presentation mode only.
 * Does not infer Phone / Tablet / Desktop from width, touch, UA, or orientation.
 * Does not invent a new Tablet rail or restore Desktop side nav.
 */

import type { DibayDeviceClass } from "@/lib/device/dibay-device-class";
import {
  layoutFamilyForDeviceClass,
  type DibayLayoutFamily,
  type DibayLayoutMode,
} from "@/lib/device/dibay-layout-resolver";
import type { DibayWindowClass } from "@/lib/device/dibay-window-class";

export type DibayShellFamily = "PHONE" | "TABLET" | "DESKTOP" | "UNKNOWN";

export type DibayNavigationPresentation = "EXISTING_MAIN_BOTTOM_NAV";

export type DibayAppShellResolverInput = {
  deviceClass: DibayDeviceClass;
  layoutMode: DibayLayoutMode;
  windowClass?: DibayWindowClass;
  keyboardOpen?: boolean;
  orientation?: "portrait" | "landscape" | "unknown";
};

export type DibayAppShellResolution = {
  deviceClass: DibayDeviceClass;
  shellFamily: DibayShellFamily;
  layoutMode: DibayLayoutMode;
  layoutFamily: DibayLayoutFamily;
  windowClass: DibayWindowClass | null;
  navigationPresentation: DibayNavigationPresentation;
  keyboardOpen: boolean;
  domainLayoutActivated: false;
  identitySource: "device_class";
  presentationSource: "existing_main_bottom_nav";
};

export const DIBAY_UNKNOWN_SAFE_SHELL_FAMILY: DibayShellFamily = "UNKNOWN";

export function shellFamilyForDeviceClass(deviceClass: DibayDeviceClass): DibayShellFamily {
  const family = layoutFamilyForDeviceClass(deviceClass);
  if (family === "PHONE" || family === "TABLET" || family === "DESKTOP") return family;
  return "UNKNOWN";
}

export function resolveAppShell(input: DibayAppShellResolverInput): DibayAppShellResolution {
  const shellFamily = shellFamilyForDeviceClass(input.deviceClass);
  return {
    deviceClass: input.deviceClass,
    shellFamily,
    layoutMode: input.layoutMode,
    layoutFamily: layoutFamilyForDeviceClass(input.deviceClass),
    windowClass: input.windowClass ?? null,
    navigationPresentation: "EXISTING_MAIN_BOTTOM_NAV",
    keyboardOpen: input.keyboardOpen === true,
    domainLayoutActivated: false,
    identitySource: "device_class",
    presentationSource: "existing_main_bottom_nav",
  };
}
