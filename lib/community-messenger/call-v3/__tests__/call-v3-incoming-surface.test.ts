import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyCallV3NativeIncomingSurfaceSignal,
  getCallV3NativeForegroundIncomingCallId,
  hasCallV3NativeIncomingSurfaceForCall,
  resetCallV3IncomingSurfaceForTests,
  resolveCallV3AppVisibility,
  shouldSuppressCallV3IncomingDiscoveredForBanner,
  shouldSuppressCallV3WebIncomingBanner,
} from "@/lib/community-messenger/call-v3/call-v3-incoming-surface";

describe("call-v3-incoming-surface", () => {
  beforeEach(() => {
    resetCallV3IncomingSurfaceForTests();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("allows web banner in foreground", () => {
    expect(
      shouldSuppressCallV3WebIncomingBanner({
        callId: "call-1",
        visibilityState: "visible",
      }),
    ).toEqual({ suppress: false, reason: null });
  });

  it("suppresses web banner in background", () => {
    expect(
      shouldSuppressCallV3WebIncomingBanner({
        callId: "call-1",
        visibilityState: "hidden",
      }),
    ).toEqual({ suppress: true, reason: "background_native_owner" });
  });

  it("suppresses discovery for banner when background", () => {
    expect(
      shouldSuppressCallV3IncomingDiscoveredForBanner({
        callId: "call-lock",
        visibilityState: "hidden",
      }),
    ).toEqual({ suppress: true, reason: "background_native_owner" });
  });

  it("suppresses web banner when native foreground pill owns call", () => {
    applyCallV3NativeIncomingSurfaceSignal({
      callId: "call-pill",
      hasNativeIncomingSurface: true,
      nativeSurfaceType: "foreground_pill",
      appVisibility: "foreground",
      source: "native_foreground_pill",
    });

    expect(getCallV3NativeForegroundIncomingCallId()).toBe("call-pill");
    expect(hasCallV3NativeIncomingSurfaceForCall("call-pill")).toBe(true);
    expect(
      shouldSuppressCallV3WebIncomingBanner({
        callId: "call-pill",
        visibilityState: "visible",
      }),
    ).toEqual({ suppress: true, reason: "native_foreground_pill" });
  });

  it("clears native foreground pill when surface dismissed", () => {
    applyCallV3NativeIncomingSurfaceSignal({
      callId: "call-pill",
      hasNativeIncomingSurface: true,
      nativeSurfaceType: "foreground_pill",
      appVisibility: "foreground",
      source: "native_foreground_pill",
    });
    applyCallV3NativeIncomingSurfaceSignal({
      callId: "call-pill",
      hasNativeIncomingSurface: false,
      appVisibility: "foreground",
      source: "native_foreground_pill",
    });

    expect(getCallV3NativeForegroundIncomingCallId()).toBeNull();
    expect(
      shouldSuppressCallV3WebIncomingBanner({
        callId: "call-pill",
        visibilityState: "visible",
      }),
    ).toEqual({ suppress: false, reason: null });
  });

  it("maps document visibility to app visibility", () => {
    expect(resolveCallV3AppVisibility("visible")).toBe("foreground");
    expect(resolveCallV3AppVisibility("hidden")).toBe("background");
  });
});
