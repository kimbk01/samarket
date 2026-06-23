import { describe, expect, it, beforeEach } from "vitest";
import {
  applyCallV4NativeIncomingSurfaceSignal,
  clearAllCallV4NativeAcceptingSurfaces,
  clearCallV4NativeAcceptingSurface,
  isCallV4NativeAcceptingSurface,
  registerCallV4NativeAcceptingSurface,
  resolveCallV4NativeAcceptingSurfaceType,
  shouldRegisterCallV4NativeAcceptingFromRoute,
  shouldSuppressCallV4WebIncomingSheet,
  shouldUseCallV4WebIncomingSheet,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";

describe("call-v4 incoming surface", () => {
  beforeEach(() => {
    clearAllCallV4NativeAcceptingSurfaces();
    applyCallV4NativeIncomingSurfaceSignal({
      callId: "call-reset",
      hasNativeIncomingSurface: false,
      source: "test_reset",
    });
  });

  it("uses web sheet only in foreground", () => {
    expect(shouldUseCallV4WebIncomingSheet("foreground")).toBe(true);
    expect(shouldUseCallV4WebIncomingSheet("background")).toBe(false);
    expect(shouldUseCallV4WebIncomingSheet("locked")).toBe(false);
  });

  it("suppresses web sheet when background native owner", () => {
    const result = shouldSuppressCallV4WebIncomingSheet({
      callId: "call-1",
      visibilityState: "hidden",
    });
    expect(result.suppress).toBe(true);
    expect(result.reason).toBe("background_native_owner");
  });

  it("suppresses web sheet when native fullscreen surface active in background", () => {
    applyCallV4NativeIncomingSurfaceSignal({
      callId: "call-2",
      hasNativeIncomingSurface: true,
      nativeSurfaceType: "fullscreen_intent",
      appVisibility: "background",
      source: "test",
    });
    const result = shouldSuppressCallV4WebIncomingSheet({
      callId: "call-2",
      visibilityState: "hidden",
    });
    expect(result.suppress).toBe(true);
    expect(result.reason).toBe("background_native_owner");
  });

  it("suppresses web sheet when native accept is in flight", () => {
    registerCallV4NativeAcceptingSurface("call-3", "native_fullscreen_accept", "native_accept");
    expect(isCallV4NativeAcceptingSurface("call-3")).toBe(true);
    const result = shouldSuppressCallV4WebIncomingSheet({
      callId: "call-3",
      visibilityState: "visible",
    });
    expect(result.suppress).toBe(true);
    expect(result.reason).toBe("native_accepting");
  });

  it("clears native accepting surface", () => {
    registerCallV4NativeAcceptingSurface("call-4", "native_accepting", "native");
    clearCallV4NativeAcceptingSurface("call-4");
    expect(isCallV4NativeAcceptingSurface("call-4")).toBe(false);
  });

  it("registers native accepting from accept route except sheet source", () => {
    const acceptPath =
      "/community-messenger/calls-v4/call-5?action=accept&source=native_accept";
    const sheetPath = "/community-messenger/calls-v4/call-5?action=accept&source=sheet";
    expect(shouldRegisterCallV4NativeAcceptingFromRoute(acceptPath)).toBe(true);
    expect(shouldRegisterCallV4NativeAcceptingFromRoute(sheetPath)).toBe(false);
    expect(resolveCallV4NativeAcceptingSurfaceType("native_accept")).toBe("native_fullscreen_accept");
    expect(resolveCallV4NativeAcceptingSurfaceType("lock_fsi")).toBe("native_locked_accept");
  });
});
