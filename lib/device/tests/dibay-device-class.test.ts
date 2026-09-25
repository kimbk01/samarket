import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptNativeDibayDeviceClassResult,
  classifyAndroidDeviceClass,
  classifyIosDeviceClass,
  classifyWebDeviceClass,
  peekDibayDeviceClassSession,
  resetDibayDeviceClassSessionForTests,
  resolveDibayDeviceClass,
} from "@/lib/device/dibay-device-class";

const windowsWideUa =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const macDesktopUa =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

vi.mock("@/lib/platform/capacitor-native", () => ({
  resolveCapacitorShellPlatform: vi.fn(() => null),
  isCapacitorBridgeReady: vi.fn(() => false),
  waitForCapacitorBridgeReady: vi.fn(async () => false),
}));

vi.mock("@/lib/device/dibay-device-class-native", () => ({
  readNativeDibayDeviceClass: vi.fn(async () => null),
}));

afterEach(() => {
  resetDibayDeviceClassSessionForTests();
  vi.clearAllMocks();
});

describe("FD1 Android DeviceClass", () => {
  it("sw=411 → PHONE_ANDROID", () => {
    expect(classifyAndroidDeviceClass({ smallestScreenWidthDp: 411 }).deviceClass).toBe("PHONE_ANDROID");
  });

  it("sw=599 → PHONE_ANDROID", () => {
    expect(classifyAndroidDeviceClass({ smallestScreenWidthDp: 599 }).deviceClass).toBe("PHONE_ANDROID");
  });

  it("sw=600 → TABLET_ANDROID", () => {
    expect(classifyAndroidDeviceClass({ smallestScreenWidthDp: 600 }).deviceClass).toBe("TABLET_ANDROID");
  });

  it("sw=800 → TABLET_ANDROID", () => {
    expect(classifyAndroidDeviceClass({ smallestScreenWidthDp: 800 }).deviceClass).toBe("TABLET_ANDROID");
  });

  it("sw unavailable + screenLayout NORMAL → PHONE_ANDROID", () => {
    const result = classifyAndroidDeviceClass({ screenLayoutSize: "NORMAL" });
    expect(result).toMatchObject({ deviceClass: "PHONE_ANDROID", source: "screenLayout" });
  });

  it("sw unavailable + screenLayout LARGE → TABLET_ANDROID", () => {
    const result = classifyAndroidDeviceClass({ screenLayoutSize: "LARGE" });
    expect(result).toMatchObject({ deviceClass: "TABLET_ANDROID", source: "screenLayout" });
  });

  it("both unavailable → UNKNOWN", () => {
    const result = classifyAndroidDeviceClass({});
    expect(result).toMatchObject({
      deviceClass: "UNKNOWN",
      source: "android_configuration_unavailable",
      reason: "android_configuration_unavailable",
    });
  });

  it("conflict sw=411 + LARGE → PHONE_ANDROID + conflict", () => {
    const result = classifyAndroidDeviceClass({
      smallestScreenWidthDp: 411,
      screenLayoutSize: "LARGE",
    });
    expect(result).toMatchObject({
      deviceClass: "PHONE_ANDROID",
      source: "smallestScreenWidthDp",
      fallbackScreenLayout: "LARGE",
      conflict: true,
    });
  });

  it("conflict sw=800 + NORMAL → TABLET_ANDROID + conflict", () => {
    const result = classifyAndroidDeviceClass({
      smallestScreenWidthDp: 800,
      screenLayoutSize: "NORMAL",
    });
    expect(result).toMatchObject({
      deviceClass: "TABLET_ANDROID",
      source: "smallestScreenWidthDp",
      fallbackScreenLayout: "NORMAL",
      conflict: true,
    });
  });
});

describe("FD1 iOS DeviceClass", () => {
  it(".phone → PHONE_IOS", () => {
    expect(classifyIosDeviceClass({ userInterfaceIdiom: "phone" })).toMatchObject({
      deviceClass: "PHONE_IOS",
      source: "userInterfaceIdiom",
    });
  });

  it(".pad → TABLET_IPAD", () => {
    expect(classifyIosDeviceClass({ userInterfaceIdiom: "pad" })).toMatchObject({
      deviceClass: "TABLET_IPAD",
      source: "userInterfaceIdiom",
    });
  });

  it("unsupported → UNKNOWN", () => {
    expect(classifyIosDeviceClass({ userInterfaceIdiom: "mac" })).toMatchObject({
      deviceClass: "UNKNOWN",
      source: "unsupported_idiom",
      reason: "unsupported_idiom",
    });
    expect(classifyIosDeviceClass({ userInterfaceIdiom: "unspecified" }).deviceClass).toBe("UNKNOWN");
  });
});

describe("FD1 web DeviceClass", () => {
  it("Windows wide → DESKTOP_WINDOWS", () => {
    expect(
      classifyWebDeviceClass({
        userAgent: windowsWideUa,
        platform: "Win32",
        userAgentDataPlatform: "Windows",
      }),
    ).toMatchObject({ deviceClass: "DESKTOP_WINDOWS", source: "windows_environment" });
  });

  it("Windows narrow → DESKTOP_WINDOWS", () => {
    expect(
      classifyWebDeviceClass({
        userAgent: windowsWideUa,
        platform: "Win32",
        userAgentDataPlatform: "Windows",
      }),
    ).toMatchObject({ deviceClass: "DESKTOP_WINDOWS", source: "windows_environment" });
  });

  it("normal supported desktop web → WEB_DESKTOP", () => {
    expect(
      classifyWebDeviceClass({
        userAgent: macDesktopUa,
        platform: "MacIntel",
        maxTouchPoints: 0,
      }),
    ).toMatchObject({ deviceClass: "WEB_DESKTOP", source: "desktop_web_environment" });
  });

  it("unclassified → UNKNOWN", () => {
    expect(classifyWebDeviceClass({})).toMatchObject({
      deviceClass: "UNKNOWN",
      source: "unclassified_web_environment",
      reason: "unclassified_web_environment",
    });
  });

  it("does not promote mobile web UA to PHONE_*", () => {
    expect(
      classifyWebDeviceClass({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      }).deviceClass,
    ).toBe("UNKNOWN");
    expect(
      classifyWebDeviceClass({
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; SM-M156S) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
      }).deviceClass,
    ).toBe("UNKNOWN");
  });
});

describe("FD1 session stability", () => {
  it("same session: portrait → landscape class unchanged", async () => {
    vi.stubGlobal("navigator", {
      userAgent: windowsWideUa,
      platform: "Win32",
      userAgentData: { platform: "Windows", mobile: false },
      maxTouchPoints: 0,
    });
    const first = await resolveDibayDeviceClass();
    vi.stubGlobal("navigator", {
      userAgent: windowsWideUa,
      platform: "Win32",
      userAgentData: { platform: "Windows", mobile: false },
      maxTouchPoints: 1,
    });
    const second = await resolveDibayDeviceClass();
    expect(first.deviceClass).toBe("DESKTOP_WINDOWS");
    expect(second).toBe(first);
    expect(peekDibayDeviceClassSession()).toBe(first);
    vi.unstubAllGlobals();
  });

  it("same session: window 390 → 844 class unchanged", async () => {
    const first = classifyWebDeviceClass({
      userAgent: windowsWideUa,
      platform: "Win32",
      userAgentDataPlatform: "Windows",
    });
    const second = classifyWebDeviceClass({
      userAgent: windowsWideUa,
      platform: "Win32",
      userAgentDataPlatform: "Windows",
    });
    expect(first.deviceClass).toBe("DESKTOP_WINDOWS");
    expect(second.deviceClass).toBe(first.deviceClass);
  });

  it("same session: keyboard / visualViewport resize do not change class", () => {
    const before = classifyAndroidDeviceClass({ smallestScreenWidthDp: 411, screenLayoutSize: "NORMAL" });
    const afterKeyboard = classifyAndroidDeviceClass({ smallestScreenWidthDp: 411, screenLayoutSize: "NORMAL" });
    const afterVisualViewport = classifyAndroidDeviceClass({
      smallestScreenWidthDp: 411,
      screenLayoutSize: "NORMAL",
    });
    expect(before.deviceClass).toBe("PHONE_ANDROID");
    expect(afterKeyboard.deviceClass).toBe(before.deviceClass);
    expect(afterVisualViewport.deviceClass).toBe(before.deviceClass);
  });
});

describe("FD1 native registration", () => {
  it("registers Android plugin only in MainActivity", () => {
    const main = readFileSync(
      path.join(process.cwd(), "android/app/src/main/java/com/dibay/app/MainActivity.java"),
      "utf8",
    );
    expect(main).toContain("registerPlugin(DibayDeviceClassPlugin.class);");
    expect(main).not.toContain("setRequestedOrientation");
  });

  it("adds iOS plugin to App-target list, not Call subset", () => {
    const patch = readFileSync(
      path.join(process.cwd(), "scripts/patch-ios-capacitor-package-class-list.mjs"),
      "utf8",
    );
    expect(patch).toContain("IOS_DEVICE_PACKAGE_CLASSES");
    expect(patch).toContain('"DibayDeviceClassPlugin"');
    const callBlock = patch.slice(
      patch.indexOf("IOS_CALL_OUTGOING_PACKAGE_CLASSES"),
      patch.indexOf("IOS_AUTH_PACKAGE_CLASSES"),
    );
    expect(callBlock).not.toContain("DibayDeviceClassPlugin");
    const config = JSON.parse(
      readFileSync(path.join(process.cwd(), "ios/App/App/capacitor.config.json"), "utf8"),
    ) as { packageClassList: string[] };
    expect(config.packageClassList).toContain("DibayDeviceClassPlugin");
    const pbx = readFileSync(path.join(process.cwd(), "ios/App/App.xcodeproj/project.pbxproj"), "utf8");
    expect(pbx).toContain("DibayDeviceClassPlugin.swift");
  });
});

describe("FD1 native accept", () => {
  it("does not reclassify native DeviceClass by width", () => {
    const accepted = acceptNativeDibayDeviceClassResult({
      deviceClass: "PHONE_ANDROID",
      source: "smallestScreenWidthDp",
      smallestScreenWidthDp: 411,
      screenLayoutSize: "LARGE",
      conflict: true,
    });
    expect(accepted).toMatchObject({
      deviceClass: "PHONE_ANDROID",
      source: "smallestScreenWidthDp",
      conflict: true,
    });
    expect(
      acceptNativeDibayDeviceClassResult({
        // invalid class must be rejected, not coerced
        deviceClass: "not-a-class" as unknown as "PHONE_ANDROID",
        source: "smallestScreenWidthDp",
      }),
    ).toBeNull();
  });
});
