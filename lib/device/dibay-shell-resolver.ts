/**
 * FD4 App Shell / Navigation authority.
 *
 * Consumes FD1 DeviceClass as identity.
 * Consumes FD2 LayoutMode as presentation mode only.
 * Does not infer Phone / Tablet / Desktop from width, touch, UA, or orientation.
 * Does not invent a new Tablet rail.
 *
 * Owner 잠금 해제 2026-11-07 (「잠금 해제·설계서 작성」 → 「D1·D2 구현」):
 * DESKTOP 계열만 왼쪽 세로 레일(`DESKTOP_SIDE_RAIL`) — 같은 `BottomNav` 를 세로로 배치한다(로직 복제 없음).
 * PHONE·TABLET·UNKNOWN 은 기존 하단 탭 그대로. 창 폭으로 바꾸지 않는다.
 * 설계: docs/audit/windows-desktop-shell-rail-design-2026-11-07.md
 */

import type { DibayDeviceClass } from "@/lib/device/dibay-device-class";
import {
  layoutFamilyForDeviceClass,
  type DibayLayoutFamily,
  type DibayLayoutMode,
} from "@/lib/device/dibay-layout-resolver";
import type { DibayWindowClass } from "@/lib/device/dibay-window-class";

export type DibayShellFamily = "PHONE" | "TABLET" | "DESKTOP" | "UNKNOWN";

export type DibayNavigationPresentation = "EXISTING_MAIN_BOTTOM_NAV" | "DESKTOP_SIDE_RAIL";

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
  presentationSource: "existing_main_bottom_nav" | "desktop_side_rail";
};

export const DIBAY_UNKNOWN_SAFE_SHELL_FAMILY: DibayShellFamily = "UNKNOWN";

export function shellFamilyForDeviceClass(deviceClass: DibayDeviceClass): DibayShellFamily {
  const family = layoutFamilyForDeviceClass(deviceClass);
  if (family === "PHONE" || family === "TABLET" || family === "DESKTOP") return family;
  return "UNKNOWN";
}

export function resolveAppShell(input: DibayAppShellResolverInput): DibayAppShellResolution {
  const shellFamily = shellFamilyForDeviceClass(input.deviceClass);
  const sideRail = shellFamily === "DESKTOP";
  return {
    deviceClass: input.deviceClass,
    shellFamily,
    layoutMode: input.layoutMode,
    layoutFamily: layoutFamilyForDeviceClass(input.deviceClass),
    windowClass: input.windowClass ?? null,
    navigationPresentation: sideRail ? "DESKTOP_SIDE_RAIL" : "EXISTING_MAIN_BOTTOM_NAV",
    keyboardOpen: input.keyboardOpen === true,
    domainLayoutActivated: false,
    identitySource: "device_class",
    presentationSource: sideRail ? "desktop_side_rail" : "existing_main_bottom_nav",
  };
}
