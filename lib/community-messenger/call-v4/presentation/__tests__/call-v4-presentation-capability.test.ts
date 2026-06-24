import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/platform/capacitor-native", () => ({
  resolveCapacitorShellPlatform: vi.fn(() => null),
  isCapacitorNativePlatform: vi.fn(() => false),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-phase6-flags", () => ({
  isCallV4VideoEnabled: vi.fn(() => true),
  isCallV4PipEnabled: vi.fn(() => true),
  isCallV4DockEnabled: vi.fn(() => true),
}));

import {
  detectCallV4IosNativePipAvailable,
  resolveCallV4PresentationCapabilities,
  resolveCallV4PresentationPlatform,
  supportsCallV4AndroidOsPipBridge,
  supportsCallV4FloatingDock,
} from "@/lib/community-messenger/call-v4/presentation/call-v4-presentation-capability";
import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";

describe("call-v4 presentation capability", () => {
  beforeEach(() => {
    vi.mocked(resolveCapacitorShellPlatform).mockReturnValue(null);
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(false);
  });

  it("web platform uses floating dock only", () => {
    expect(resolveCallV4PresentationPlatform()).toBe("web");
    expect(resolveCallV4PresentationCapabilities()).toEqual(["web_floating_dock"]);
    expect(supportsCallV4FloatingDock()).toBe(true);
    expect(supportsCallV4AndroidOsPipBridge()).toBe(false);
  });

  it("android platform exposes OS PiP bridge + dock", () => {
    vi.mocked(resolveCapacitorShellPlatform).mockReturnValue("android");
    expect(resolveCallV4PresentationPlatform()).toBe("android");
    expect(resolveCallV4PresentationCapabilities()).toEqual(["web_floating_dock", "android_os_pip"]);
    expect(supportsCallV4AndroidOsPipBridge()).toBe(true);
  });

  it("ios platform defaults to dock fallback without native pip plugin", () => {
    vi.mocked(resolveCapacitorShellPlatform).mockReturnValue("ios");
    expect(resolveCallV4PresentationPlatform()).toBe("ios");
    expect(resolveCallV4PresentationCapabilities()).toEqual(["ios_dock_fallback"]);
    expect(detectCallV4IosNativePipAvailable()).toBe(false);
  });
});
