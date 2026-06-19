import { describe, expect, it, beforeEach } from "vitest";
import {
  canRenderIncomingCallSurface,
  claimIncomingCallSurface,
  getIncomingCallSurfaceOwner,
  isIncomingCallSurfaceVisible,
  isRingingOnlyIncomingCallRoute,
  markIncomingCallSurfaceConsumed,
  releaseIncomingCallSurface,
  resetIncomingCallSurfaceOwner,
} from "@/lib/community-messenger/incoming-call-surface-owner";

describe("incoming-call-surface-owner", () => {
  beforeEach(() => {
    resetIncomingCallSurfaceOwner();
  });

  it("allows only one visible owner per callId", () => {
    expect(claimIncomingCallSurface("call-1", "native_fullscreen", "test").ok).toBe(true);
    expect(getIncomingCallSurfaceOwner("call-1")).toBe("native_fullscreen");
    expect(isIncomingCallSurfaceVisible("call-1")).toBe(true);

    const blocked = claimIncomingCallSurface("call-1", "web_foreground_overlay", "test");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.currentOwner).toBe("native_fullscreen");
    }
    expect(canRenderIncomingCallSurface("call-1", "web_foreground_overlay")).toBe(false);
  });

  it("native_foreground_pill blocks web banner but allows call_screen", () => {
    claimIncomingCallSurface("call-pill", "native_foreground_pill", "test");
    expect(canRenderIncomingCallSurface("call-pill", "web_foreground_overlay")).toBe(false);
    expect(canRenderIncomingCallSurface("call-pill", "call_screen")).toBe(true);
    expect(getIncomingCallSurfaceOwner("call-pill")).toBe("call_screen");
  });

  it("call_screen blocks web_foreground_overlay", () => {
    expect(claimIncomingCallSurface("call-2", "call_screen", "test").ok).toBe(true);
    expect(canRenderIncomingCallSurface("call-2", "web_foreground_overlay")).toBe(false);
    expect(getIncomingCallSurfaceOwner("call-2")).toBe("call_screen");
  });

  it("terminal_suppressed blocks all surfaces", () => {
    markIncomingCallSurfaceConsumed("call-3", "missed", "test");
    expect(getIncomingCallSurfaceOwner("call-3")).toBe("terminal_suppressed");
    expect(canRenderIncomingCallSurface("call-3", "call_screen")).toBe(false);
    expect(canRenderIncomingCallSurface("call-3", "native_fullscreen")).toBe(false);
  });

  it("release only from matching owner", () => {
    claimIncomingCallSurface("call-4", "web_foreground_overlay", "test");
    releaseIncomingCallSurface("call-4", "call_screen", "test");
    expect(getIncomingCallSurfaceOwner("call-4")).toBe("web_foreground_overlay");
    releaseIncomingCallSurface("call-4", "web_foreground_overlay", "test");
    expect(getIncomingCallSurfaceOwner("call-4")).toBe("none");
  });

  it("detects ringing-only pending call routes", () => {
    expect(isRingingOnlyIncomingCallRoute("/community-messenger/calls/abc-123")).toBe(true);
    expect(isRingingOnlyIncomingCallRoute("/community-messenger/calls/abc-123?source=native_push")).toBe(
      true,
    );
    expect(
      isRingingOnlyIncomingCallRoute(
        "/community-messenger/calls/abc-123?action=accept&nativeAccept=1",
      ),
    ).toBe(false);
    expect(isRingingOnlyIncomingCallRoute("/community-messenger/calls/abc-123?incomingPreview=1")).toBe(
      false,
    );
    expect(isRingingOnlyIncomingCallRoute("/community-messenger/calls/outgoing")).toBe(false);
  });
});
