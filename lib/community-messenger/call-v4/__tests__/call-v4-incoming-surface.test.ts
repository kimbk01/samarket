import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => false),
}));

import {
  applyCallV4NativeIncomingSurfaceSignal,
  applyCallV4SurfaceOwnerSignal,
  canRenderCallV4WebIncomingSheet,
  clearAllCallV4NativeAcceptingSurfaces,
  clearCallV4NativeAcceptingSurface,
  clearCallV4SurfaceOwner,
  getCallV4PersistedSurfaceOwner,
  ingestCallV4NativeIncomingSurfaceSignal,
  isCallV4AcceptedTransitionOwner,
  isCallV4NativeAcceptingSurface,
  isCallV4NativePersistedSurfaceOwner,
  logCallV4IncomingOwnerDecided,
  registerCallV4NativeAcceptingSurface,
  resolveCallV4NativeAcceptingSurfaceType,
  shouldRegisterCallV4NativeAcceptingFromRoute,
  shouldSuppressCallV4WebIncomingSheet,
  shouldUseCallV4WebIncomingSheet,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";

describe("call-v4 incoming surface", () => {
  beforeEach(() => {
    clearAllCallV4NativeAcceptingSurfaces();
    clearCallV4SurfaceOwner("call-reset", "test_reset");
    applyCallV4NativeIncomingSurfaceSignal({
      callId: "call-reset",
      hasNativeIncomingSurface: false,
      source: "test_reset",
    });
  });

  it("suppresses web sheet when persisted native_activity owner is set", () => {
    applyCallV4SurfaceOwnerSignal({
      callId: "call-warm",
      owner: "native_activity",
      reason: "fcm_push_delivery",
      ts: Date.now(),
    });
    expect(isCallV4NativePersistedSurfaceOwner("call-warm")).toBe(true);
    const result = shouldSuppressCallV4WebIncomingSheet({
      callId: "call-warm",
      visibilityState: "visible",
    });
    expect(result.suppress).toBe(true);
    expect(result.reason).toBe("persisted_native_owner");
  });

  it("defers web sheet until owner confirmed or timeout", () => {
    const discoveredAt = Date.now();
    const pending = canRenderCallV4WebIncomingSheet({
      callId: "call-defer",
      visibilityState: "visible",
      discoveredAtMs: discoveredAt,
      nowMs: discoveredAt + 50,
    });
    expect(pending.render).toBe(false);
    expect(pending.reason).toBe("owner_pending");

    applyCallV4SurfaceOwnerSignal({
      callId: "call-defer",
      owner: "web_in_app",
      reason: "fcm_foreground",
      ts: Date.now(),
    });
    const ready = canRenderCallV4WebIncomingSheet({
      callId: "call-defer",
      visibilityState: "visible",
      discoveredAtMs: discoveredAt,
      nowMs: discoveredAt + 50,
    });
    expect(ready.render).toBe(true);
    expect(getCallV4PersistedSurfaceOwner("call-defer")).toBe("web_in_app");
  });

  it("blocks web sheet during accepted_transition owner", () => {
    applyCallV4SurfaceOwnerSignal({
      callId: "call-accept",
      owner: "accepted_transition",
      reason: "native_accept",
      ts: Date.now(),
    });
    expect(isCallV4AcceptedTransitionOwner("call-accept")).toBe(true);
    const result = shouldSuppressCallV4WebIncomingSheet({
      callId: "call-accept",
      visibilityState: "visible",
    });
    expect(result.suppress).toBe(true);
    expect(result.reason).toBe("accepted_transition");
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
    expect(result.reason).toBe("native_surface_active");
  });

  it("suppresses web sheet in foreground when fullscreen native surface is active", () => {
    applyCallV4NativeIncomingSurfaceSignal({
      callId: "call-fg-fsi",
      hasNativeIncomingSurface: true,
      nativeSurfaceType: "fullscreen_intent",
      appVisibility: "background",
      source: "incoming_activity_visible",
    });
    const result = shouldSuppressCallV4WebIncomingSheet({
      callId: "call-fg-fsi",
      visibilityState: "visible",
    });
    expect(result.suppress).toBe(true);
    expect(result.reason).toBe("native_surface_active");
  });

  it("ingest updates surface without requiring apply dispatch", () => {
    ingestCallV4NativeIncomingSurfaceSignal({
      callId: "call-ingest",
      hasNativeIncomingSurface: true,
      nativeSurfaceType: "fullscreen_intent",
      source: "incoming_activity_visible",
    });
    const result = shouldSuppressCallV4WebIncomingSheet({
      callId: "call-ingest",
      visibilityState: "visible",
    });
    expect(result.suppress).toBe(true);
    expect(result.reason).toBe("native_surface_active");
  });

  it("does not suppress web sheet when native foreground pill signal is present", () => {
    applyCallV4NativeIncomingSurfaceSignal({
      callId: "call-pill",
      hasNativeIncomingSurface: true,
      nativeSurfaceType: "foreground_pill",
      appVisibility: "foreground",
      source: "test",
    });
    const result = shouldSuppressCallV4WebIncomingSheet({
      callId: "call-pill",
      visibilityState: "visible",
    });
    expect(result.suppress).toBe(false);
    expect(result.reason).toBeNull();
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

  it("logs incoming_owner_conflict_blocked when web_foreground conflicts with native fsi", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    applyCallV4NativeIncomingSurfaceSignal({
      callId: "call-conflict",
      hasNativeIncomingSurface: true,
      nativeSurfaceType: "fullscreen_intent",
      source: "incoming_activity_visible",
    });
    logCallV4IncomingOwnerDecided({ callId: "call-conflict", owner: "web_foreground", visibility: "foreground" });
    expect(info).toHaveBeenCalledWith(
      "[DIBAY_CALL_V4]",
      "incoming_owner_conflict_blocked",
      expect.objectContaining({
        callId: "call-conflict",
        native: true,
        web_sheet: false,
      }),
    );
    info.mockRestore();
  });

  it("logs incoming_owner_decided with web_foreground owner", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logCallV4IncomingOwnerDecided({ callId: "call-owner", owner: "web_foreground", visibility: "foreground" });
    expect(info).toHaveBeenCalledWith(
      "[DIBAY_CALL_V4]",
      "incoming_owner_decided",
      expect.objectContaining({
        callId: "call-owner",
        owner: "web_foreground",
        visibility: "foreground",
      }),
    );
    info.mockRestore();
  });
});
