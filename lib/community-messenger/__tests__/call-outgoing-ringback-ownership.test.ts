import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => true),
  resolveCapacitorShellPlatform: vi.fn(() => "android"),
}));

vi.mock("@/lib/call/native/native-outgoing-bridge", () => ({
  isAndroidNativeOutgoingShell: vi.fn(() => true),
  isIOSNativeOutgoingShell: vi.fn(async () => false),
  isIOSNativeVideoOutgoingShell: vi.fn(async () => false),
}));

import { shouldSkipWebOutgoingRingbackSync } from "@/lib/community-messenger/call-outgoing-ringback-ownership";
import { isAndroidNativeOutgoingShell } from "@/lib/call/native/native-outgoing-bridge";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

describe("call-outgoing-ringback-ownership", () => {
  beforeEach(() => {
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(true);
    vi.mocked(resolveCapacitorShellPlatform).mockReturnValue("android");
    vi.mocked(isAndroidNativeOutgoingShell).mockReturnValue(true);
  });

  it("skips Web ringback on Android native outgoing shell", () => {
    expect(shouldSkipWebOutgoingRingbackSync("voice")).toBe(true);
    expect(shouldSkipWebOutgoingRingbackSync("video")).toBe(true);
  });

  it("does not skip on web browser", () => {
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(false);
    expect(shouldSkipWebOutgoingRingbackSync("voice")).toBe(false);
  });
});
