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

  it("TABLET_ANDROID + COMPACT stays TABLET, not Phone BottomNav identity", () => {
    const shell = shellOf("TABLET_ANDROID", 601);
    expect(shell.shellFamily).toBe("TABLET");
    expect(shell.layoutMode).toBe("TABLET_STACKED");
    expect(shell.navigationPresentation).toBe("EXISTING_MAIN_BOTTOM_NAV");
  });

  it("TABLET_ANDROID + MEDIUM stays TABLET, not Desktop", () => {
    const shell = shellOf("TABLET_ANDROID", 1007);
    expect(shell.shellFamily).toBe("TABLET");
    expect(shell.layoutMode).toBe("TABLET_DUAL");
    expect(shell.domainLayoutActivated).toBe(false);
    expect(shell.navigationPresentation).toBe("EXISTING_MAIN_BOTTOM_NAV");
  });

  it("TABLET_IPAD + COMPACT stays TABLET", () => {
    expect(shellOf("TABLET_IPAD", 744).shellFamily).toBe("TABLET");
  });

  it("TABLET_IPAD + EXPANDED stays TABLET", () => {
    const shell = shellOf("TABLET_IPAD", 1230);
    expect(shell.shellFamily).toBe("TABLET");
    expect(shell.navigationPresentation).toBe("EXISTING_MAIN_BOTTOM_NAV");
  });

  it("DESKTOP_WINDOWS + COMPACT stays DESKTOP family, never Phone", () => {
    const shell = shellOf("DESKTOP_WINDOWS", 500);
    expect(shell.shellFamily).toBe("DESKTOP");
    expect(shell.layoutMode).toBe("DESKTOP_STACKED");
    expect(shell.navigationPresentation).toBe("EXISTING_MAIN_BOTTOM_NAV");
  });

  it("DESKTOP_WINDOWS + LARGE stays DESKTOP family", () => {
    const shell = shellOf("DESKTOP_WINDOWS", 1400);
    expect(shell.shellFamily).toBe("DESKTOP");
    expect(shell.navigationPresentation).toBe("EXISTING_MAIN_BOTTOM_NAV");
  });

  it("WEB_DESKTOP narrow is still Desktop family", () => {
    expect(shellOf("WEB_DESKTOP", 500).shellFamily).toBe("DESKTOP");
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
  it("every DeviceClass reuses existing BottomNav presentation", () => {
    const classes: DibayDeviceClass[] = [
      "PHONE_ANDROID",
      "PHONE_IOS",
      "TABLET_ANDROID",
      "TABLET_IPAD",
      "DESKTOP_WINDOWS",
      "WEB_DESKTOP",
      "UNKNOWN",
    ];
    for (const deviceClass of classes) {
      expect(shellFamilyForDeviceClass(deviceClass) === "UNKNOWN" || shellFamilyForDeviceClass(deviceClass)).toBeTruthy();
      expect(shellOf(deviceClass, 800).navigationPresentation).toBe("EXISTING_MAIN_BOTTOM_NAV");
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
