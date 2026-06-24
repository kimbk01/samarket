/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => false),
  resolveCapacitorShellPlatform: vi.fn(() => null),
}));

import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  applyCallV4SurfaceOwnerSignal,
  clearCallV4SurfaceOwner,
  getCallV4PersistedSurfaceOwner,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import {
  isCallV4PureWebOwnerEligible,
  tryClaimCallV4PureWebIncomingOwner,
} from "@/lib/community-messenger/call-v4/call-v4-pure-web-owner";

describe("call-v4 pure web owner (Windows/browser)", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(false);
    clearCallV4SurfaceOwner("call-pw-reset", "test_reset");
  });

  it("eligible only on non-Capacitor shell", () => {
    expect(isCallV4PureWebOwnerEligible()).toBe(true);
    vi.mocked(isCapacitorNativePlatform).mockReturnValue(true);
    expect(isCallV4PureWebOwnerEligible()).toBe(false);
  });

  it("claims web_in_app when document is visible", () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    const claimed = tryClaimCallV4PureWebIncomingOwner("call-pw-1", "pure_web_poll");
    expect(claimed).toBe(true);
    expect(getCallV4PersistedSurfaceOwner("call-pw-1")).toBe("web_in_app");
  });

  it("does not claim when document is hidden", () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    const claimed = tryClaimCallV4PureWebIncomingOwner("call-pw-2", "pure_web_poll");
    expect(claimed).toBe(false);
    expect(getCallV4PersistedSurfaceOwner("call-pw-2")).toBe("none");
  });

  it("does not override native_fsi owner", () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    applyCallV4SurfaceOwnerSignal({
      callId: "call-pw-3",
      owner: "native_fsi",
      reason: "test",
      ts: Date.now(),
    });
    const claimed = tryClaimCallV4PureWebIncomingOwner("call-pw-3", "pure_web_poll");
    expect(claimed).toBe(false);
    expect(getCallV4PersistedSurfaceOwner("call-pw-3")).toBe("native_fsi");
  });
});
