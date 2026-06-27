import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => false),
}));

import {
  applyCallV4NativeIncomingSurfaceSignal,
  applyCallV4SurfaceOwnerSignal,
  canRenderCallV4WebIncomingSheet,
  canRenderWebIncomingSheet,
  clearAllCallV4NativeAcceptingSurfaces,
  clearCallV4NativeAcceptingSurface,
  clearCallV4SurfaceOwner,
  registerCallV4NativeAcceptingSurface,
  isCallV4NativeAcceptHandoffSource,
  resolveCallV4NativeAcceptingSurfaceType,
  shouldDeferCallV4WebIncomingSheet,
  shouldRegisterCallV4NativeAcceptingFromRoute,
  shouldSuppressCallV4WebIncomingSheet,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import {
  resetNativeAcceptInflightForTests,
} from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";

describe("call-v4 Phase6A canRenderWebIncomingSheet", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    clearAllCallV4NativeAcceptingSurfaces();
    resetNativeAcceptInflightForTests();
    clearCallV4SurfaceOwner("call-reset", "test_reset");
    applyCallV4NativeIncomingSurfaceSignal({
      callId: "call-reset",
      hasNativeIncomingSurface: false,
      source: "test_reset",
    });
  });

  it("A: owner=web_in_app + incoming_ringing => allow", () => {
    applyCallV4SurfaceOwnerSignal({
      callId: "call-a",
      owner: "web_in_app",
      reason: "fcm_foreground",
      ts: Date.now(),
    });
    const result = canRenderWebIncomingSheet({ callId: "call-a", phase: "incoming_ringing" });
    expect(result.canRender).toBe(true);
    expect(result.reason).toBe("allow_web_in_app");
  });

  it("B: owner=native_activity => owner_not_web_in_app", () => {
    applyCallV4SurfaceOwnerSignal({
      callId: "call-b",
      owner: "native_activity",
      reason: "native_activity_primary",
      ts: Date.now(),
    });
    const result = canRenderWebIncomingSheet({ callId: "call-b", phase: "incoming_ringing" });
    expect(result.canRender).toBe(false);
    expect(result.reason).toBe("owner_not_web_in_app");
  });

  it("C: owner=native_fsi => owner_not_web_in_app", () => {
    applyCallV4SurfaceOwnerSignal({
      callId: "call-c",
      owner: "native_fsi",
      reason: "lock_fsi_primary",
      ts: Date.now(),
    });
    const result = canRenderWebIncomingSheet({ callId: "call-c", phase: "incoming_ringing" });
    expect(result.canRender).toBe(false);
    expect(result.reason).toBe("owner_not_web_in_app");
  });

  it("D: owner=notification_fallback => owner_not_web_in_app", () => {
    applyCallV4SurfaceOwnerSignal({
      callId: "call-d",
      owner: "notification_fallback",
      reason: "activity_launch_failed",
      ts: Date.now(),
    });
    const result = canRenderWebIncomingSheet({ callId: "call-d", phase: "incoming_ringing" });
    expect(result.canRender).toBe(false);
    expect(result.reason).toBe("owner_not_web_in_app");
  });

  it("E: owner=none => owner_pending", () => {
    const result = canRenderWebIncomingSheet({ callId: "call-e", phase: "incoming_ringing" });
    expect(result.canRender).toBe(false);
    expect(result.reason).toBe("owner_pending");
  });

  it("F: owner=web_in_app + native accept inflight => native_accept_inflight", () => {
    applyCallV4SurfaceOwnerSignal({
      callId: "call-f",
      owner: "web_in_app",
      reason: "fcm_foreground",
      ts: Date.now(),
    });
    registerCallV4NativeAcceptingSurface("call-f", "native_fullscreen_accept", "native_accept");
    const result = canRenderWebIncomingSheet({ callId: "call-f", phase: "incoming_ringing" });
    expect(result.canRender).toBe(false);
    expect(result.reason).toBe("native_accept_inflight");
  });

  it("G: owner=terminal => terminal", () => {
    applyCallV4SurfaceOwnerSignal({
      callId: "call-g",
      owner: "terminal",
      reason: "rejected",
      ts: Date.now(),
    });
    const result = canRenderWebIncomingSheet({ callId: "call-g", phase: "incoming_ringing" });
    expect(result.canRender).toBe(false);
    expect(result.reason).toBe("terminal");
  });

  it("G2: owner=web_in_app + phase=ended => terminal", () => {
    applyCallV4SurfaceOwnerSignal({
      callId: "call-g2",
      owner: "web_in_app",
      reason: "fcm_foreground",
      ts: Date.now(),
    });
    const result = canRenderWebIncomingSheet({ callId: "call-g2", phase: "ended" });
    expect(result.canRender).toBe(false);
    expect(result.reason).toBe("terminal");
  });

  it("H: owner=web_in_app + phase=joining => phase_not_ringing", () => {
    applyCallV4SurfaceOwnerSignal({
      callId: "call-h",
      owner: "web_in_app",
      reason: "fcm_foreground",
      ts: Date.now(),
    });
    const result = canRenderWebIncomingSheet({ callId: "call-h", phase: "joining" });
    expect(result.canRender).toBe(false);
    expect(result.reason).toBe("phase_not_ringing");
  });

  it("I: document visible + owner=native_fsi => false", () => {
    applyCallV4SurfaceOwnerSignal({
      callId: "call-i",
      owner: "native_fsi",
      reason: "lock_fsi_primary",
      ts: Date.now(),
    });
    const legacy = shouldSuppressCallV4WebIncomingSheet({
      callId: "call-i",
      visibilityState: "visible",
    });
    expect(legacy.suppress).toBe(true);
    expect(legacy.reason).toBe("owner_not_web_in_app");
  });

  it("J: fcm_wake native signal only without web_in_app owner => false", () => {
    applyCallV4NativeIncomingSurfaceSignal({
      callId: "call-j",
      hasNativeIncomingSurface: true,
      nativeSurfaceType: "fullscreen_intent",
      appVisibility: "background",
      source: "fcm_wake_background",
    });
    const result = canRenderWebIncomingSheet({ callId: "call-j", phase: "incoming_ringing" });
    expect(result.canRender).toBe(false);
    expect(result.reason).toBe("owner_pending");
  });

  it("defer stays pending until web_in_app owner arrives", () => {
    const discoveredAt = Date.now();
    const pending = shouldDeferCallV4WebIncomingSheet({
      callId: "call-defer",
      discoveredAtMs: discoveredAt,
      nowMs: discoveredAt + 500,
    });
    expect(pending.defer).toBe(true);
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
      phase: "incoming_ringing",
    });
    expect(ready.render).toBe(true);
  });

  it("registers native accepting from accept route except sheet source", () => {
    const acceptPath =
      "/community-messenger/calls-v4/call-5?action=accept&source=native_accept";
    const sheetPath = "/community-messenger/calls-v4/call-5?action=accept&source=sheet";
    expect(shouldRegisterCallV4NativeAcceptingFromRoute(acceptPath)).toBe(true);
    expect(shouldRegisterCallV4NativeAcceptingFromRoute(sheetPath)).toBe(false);
    expect(resolveCallV4NativeAcceptingSurfaceType("native_accept")).toBe("native_fullscreen_accept");
    expect(resolveCallV4NativeAcceptingSurfaceType("lock_fsi")).toBe("native_locked_accept");
    expect(isCallV4NativeAcceptHandoffSource("native_lock_accept")).toBe(true);
    expect(isCallV4NativeAcceptHandoffSource("native_accept")).toBe(true);
    expect(isCallV4NativeAcceptHandoffSource("sheet")).toBe(false);
  });

  it("clears native accepting surface", () => {
    registerCallV4NativeAcceptingSurface("call-4", "native_accepting", "native");
    clearCallV4NativeAcceptingSurface("call-4");
    const result = canRenderWebIncomingSheet({ callId: "call-4", phase: "incoming_ringing" });
    expect(result.reason).not.toBe("native_accept_inflight");
  });
});
