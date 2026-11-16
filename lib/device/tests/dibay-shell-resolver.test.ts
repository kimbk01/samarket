import { describe, expect, it } from "vitest";
import { resolveLayoutMode } from "@/lib/device/dibay-layout-resolver";
import { resolveAppShell, shellFamilyForDeviceClass } from "@/lib/device/dibay-shell-resolver";
import type { DibayDeviceClass } from "@/lib/device/dibay-device-class";
import type { DibayLayoutMode } from "@/lib/device/dibay-layout-resolver";

function shellOf(
  deviceClass: DibayDeviceClass,
  usableWidthPx: number,
  extras?: { keyboardOpen?: boolean; orientation?: "portrait" | "landscape" },
) {
  const layout = resolveLayoutMode({
    deviceClass,
    usableWidthPx,
    domain: "community",
    keyboardOpen: extras?.keyboardOpen,
    orientation: extras?.orientation,
  });
  return resolveAppShell({
    deviceClass,
    layoutMode: layout.layoutMode,
    windowClass: layout.windowClass,
    usableWidthPx,
    keyboardOpen: layout.keyboardOpen,
    orientation: extras?.orientation,
  });
}

describe("FD4 shell family is DeviceClass only", () => {
  it("PHONE_ANDROID + COMPACT → PHONE + existing BottomNav", () => {
    const shell = shellOf("PHONE_ANDROID", 384);
    expect(shell.shellFamily).toBe("PHONE");
    expect(shell.layoutMode).toBe("PHONE_SINGLE");
    expect(shell.navigationPresentation).toBe("EXISTING_MAIN_BOTTOM_NAV");
    expect(shell.domainLayoutActivated).toBe(false);
  });

  it("PHONE_ANDROID + LARGE artificial width stays PHONE", () => {
    const shell = shellOf("PHONE_ANDROID", 1400);
    expect(shell.shellFamily).toBe("PHONE");
    expect(shell.layoutMode).toBe("PHONE_SINGLE");
    expect(shell.navigationPresentation).toBe("EXISTING_MAIN_BOTTOM_NAV");
  });

  it("PHONE_IOS + COMPACT → PHONE", () => {
    expect(shellOf("PHONE_IOS", 430).shellFamily).toBe("PHONE");
  });

  it("TABLET_ANDROID + COMPACT(601, Xiaomi 세로) stays TABLET — v3 왼쪽 세로 메뉴", () => {
    const shell = shellOf("TABLET_ANDROID", 601);
    expect(shell.shellFamily).toBe("TABLET");
    expect(shell.layoutMode).toBe("TABLET_STACKED");
    expect(shell.navigationPresentation).toBe("DESKTOP_SIDE_RAIL");
  });

  it("TABLET_ANDROID + MEDIUM stays TABLET, not Desktop", () => {
    const shell = shellOf("TABLET_ANDROID", 1007);
    expect(shell.shellFamily).toBe("TABLET");
    expect(shell.layoutMode).toBe("TABLET_DUAL");
    expect(shell.domainLayoutActivated).toBe(false);
    expect(shell.navigationPresentation).toBe("DESKTOP_SIDE_RAIL");
  });

  it("TABLET_IPAD + COMPACT stays TABLET", () => {
    expect(shellOf("TABLET_IPAD", 744).shellFamily).toBe("TABLET");
  });

  it("TABLET_IPAD + EXPANDED stays TABLET", () => {
    const shell = shellOf("TABLET_IPAD", 1230);
    expect(shell.shellFamily).toBe("TABLET");
    expect(shell.navigationPresentation).toBe("DESKTOP_SIDE_RAIL");
  });

  it("DESKTOP_WINDOWS + COMPACT stays DESKTOP family, never Phone", () => {
    const shell = shellOf("DESKTOP_WINDOWS", 500);
    expect(shell.shellFamily).toBe("DESKTOP");
    expect(shell.layoutMode).toBe("DESKTOP_STACKED");
    /** Owner 2026-11-07 FD4 데스크톱 조항 해제 — 좁은 창이어도 세로 레일 (PC형) */
    expect(shell.navigationPresentation).toBe("DESKTOP_SIDE_RAIL");
  });

  it("DESKTOP_WINDOWS + LARGE stays DESKTOP family", () => {
    const shell = shellOf("DESKTOP_WINDOWS", 1400);
    expect(shell.shellFamily).toBe("DESKTOP");
    expect(shell.navigationPresentation).toBe("DESKTOP_SIDE_RAIL");
    expect(shell.presentationSource).toBe("desktop_side_rail");
  });

  it("WEB_DESKTOP narrow is still Desktop family", () => {
    expect(shellOf("WEB_DESKTOP", 500).shellFamily).toBe("DESKTOP");
    expect(shellOf("WEB_DESKTOP", 500).navigationPresentation).toBe("DESKTOP_SIDE_RAIL");
  });

  it("UNKNOWN stays UNKNOWN_SAFE and does not infer a family", () => {
    const shell = shellOf("UNKNOWN", 1024);
    expect(shell.shellFamily).toBe("UNKNOWN");
    expect(shell.layoutMode).toBe("UNKNOWN_SAFE");
    expect(shell.navigationPresentation).toBe("EXISTING_MAIN_BOTTOM_NAV");
  });
});

describe("FD4 keyboard and orientation cannot change shell family", () => {
  it("keyboard shrink keeps PHONE family", () => {
    const shell = shellOf("PHONE_ANDROID", 300, { keyboardOpen: true });
    expect(shell.shellFamily).toBe("PHONE");
    expect(shell.keyboardOpen).toBe(true);
  });

  it("keyboard shrink keeps TABLET family", () => {
    const shell = shellOf("TABLET_ANDROID", 400, { keyboardOpen: true });
    expect(shell.shellFamily).toBe("TABLET");
  });

  it("keyboard shrink keeps DESKTOP family", () => {
    const shell = shellOf("DESKTOP_WINDOWS", 390, { keyboardOpen: true });
    expect(shell.shellFamily).toBe("DESKTOP");
  });

  it("landscape does not promote Phone or demote Tablet", () => {
    expect(shellOf("PHONE_IOS", 932, { orientation: "landscape" }).shellFamily).toBe("PHONE");
    expect(shellOf("TABLET_ANDROID", 1007, { orientation: "landscape" }).shellFamily).toBe("TABLET");
  });
});

describe("FD4 shell resolver never invents a second nav", () => {
  it("phone·unknown keep existing BottomNav at every width (APK·iOS 무변화)", () => {
    for (const deviceClass of ["PHONE_ANDROID", "PHONE_IOS", "UNKNOWN"] as DibayDeviceClass[]) {
      for (const width of [320, 390, 800, 1024, 1400]) {
        const shell = shellOf(deviceClass, width);
        expect(shell.shellFamily).not.toBe("DESKTOP");
        expect(shell.navigationPresentation).toBe("EXISTING_MAIN_BOTTOM_NAV");
        expect(shell.presentationSource).toBe("existing_main_bottom_nav");
      }
    }
  });

  it("v3 태블릿·iPad: 창 600 이상 왼쪽 세로 메뉴, 600 미만(화면 나누기) 하단 탭 — 형태는 TABLET 그대로", () => {
    for (const deviceClass of ["TABLET_ANDROID", "TABLET_IPAD"] as DibayDeviceClass[]) {
      for (const width of [320, 590, 599]) {
        const shell = shellOf(deviceClass, width);
        expect(shell.shellFamily).toBe("TABLET");
        expect(shell.navigationPresentation).toBe("EXISTING_MAIN_BOTTOM_NAV");
      }
      for (const width of [600, 601, 744, 820, 1006, 1180, 1400]) {
        const shell = shellOf(deviceClass, width);
        expect(shell.shellFamily).toBe("TABLET");
        expect(shell.navigationPresentation).toBe("DESKTOP_SIDE_RAIL");
      }
    }
  });

  it("DESKTOP family (Windows·Mac·PC) uses the side rail at every width", () => {
    for (const deviceClass of ["DESKTOP_WINDOWS", "DESKTOP_MAC", "WEB_DESKTOP"] as DibayDeviceClass[]) {
      expect(shellFamilyForDeviceClass(deviceClass)).toBe("DESKTOP");
      for (const width of [390, 500, 800, 1400]) {
        expect(shellOf(deviceClass, width).navigationPresentation).toBe("DESKTOP_SIDE_RAIL");
      }
    }
  });

  it("layoutMode cannot change shell family by itself", () => {
    const modes: DibayLayoutMode[] = [
      "PHONE_SINGLE",
      "TABLET_STACKED",
      "TABLET_DUAL",
      "DESKTOP_STACKED",
      "DESKTOP_DUAL",
      "UNKNOWN_SAFE",
    ];
    for (const layoutMode of modes) {
      const phone = resolveAppShell({ deviceClass: "PHONE_ANDROID", layoutMode });
      expect(phone.shellFamily).toBe("PHONE");
      const desktop = resolveAppShell({ deviceClass: "DESKTOP_WINDOWS", layoutMode });
      expect(desktop.shellFamily).toBe("DESKTOP");
    }
  });
});
