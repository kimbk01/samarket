import { afterEach, describe, expect, it, vi } from "vitest";
import { resetDibayDeviceClassSessionForTests } from "@/lib/device/dibay-device-class";
import {
  DIBAY_PRE_RESOLUTION_UNKNOWN,
  readDibayDeviceClassSync,
} from "@/lib/device/dibay-device-class-hydrate";

vi.mock("@/lib/platform/capacitor-native", () => ({
  resolveCapacitorShellPlatform: vi.fn(() => null),
}));

afterEach(() => {
  resetDibayDeviceClassSessionForTests();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("FD4 DeviceClass hydrate", () => {
  it("SSR / missing navigator stays UNKNOWN, not Phone", () => {
    vi.stubGlobal("navigator", undefined);
    const result = readDibayDeviceClassSync();
    expect(result.deviceClass).toBe("UNKNOWN");
    expect(result.deviceClass).not.toBe("PHONE_ANDROID");
    expect(DIBAY_PRE_RESOLUTION_UNKNOWN.reason).toBe("pre_resolution");
  });

  it("Windows web classifies DESKTOP_WINDOWS without width", async () => {
    const { resolveCapacitorShellPlatform } = await import("@/lib/platform/capacitor-native");
    vi.mocked(resolveCapacitorShellPlatform).mockReturnValue(null);
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      platform: "Win32",
      userAgentData: { platform: "Windows", mobile: false },
      maxTouchPoints: 0,
    });
    expect(readDibayDeviceClassSync().deviceClass).toBe("DESKTOP_WINDOWS");
  });
});
