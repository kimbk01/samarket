import { describe, expect, it, beforeEach } from "vitest";
import {
  applyCallV4NativeIncomingSurfaceSignal,
  shouldSuppressCallV4WebIncomingSheet,
  shouldUseCallV4WebIncomingSheet,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";

describe("call-v4 incoming surface", () => {
  beforeEach(() => {
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
});
