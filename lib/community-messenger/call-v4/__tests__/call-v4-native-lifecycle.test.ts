import { describe, expect, it, beforeEach, vi } from "vitest";

const nativeMocks = vi.hoisted(() => ({
  stopNative: vi.fn(),
  markConsumed: vi.fn(),
  getPlugin: vi.fn(),
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => true),
  resolveCapacitorShellPlatform: vi.fn(() => "android"),
}));

vi.mock("@/lib/push/native/dibay-call-consumed-native-bridge", () => ({
  stopNativeIncomingRingtoneFireAndForget: (...args: unknown[]) => nativeMocks.stopNative(...args),
}));

vi.mock("@/lib/push/native/push-route-native-bridge", () => ({
  getNativeIncomingCallPlugin: () => nativeMocks.getPlugin(),
}));

import {
  requestCallV4NativeConsumedSync,
  requestCallV4NativeRingStop,
  resetCallV4NativeLifecycleClaimsForTests,
  syncCallV4NativeOnWebAccept,
  syncCallV4NativeOnWebReject,
  syncCallV4NativeTerminalCleanup,
} from "@/lib/community-messenger/call-v4/call-v4-native-lifecycle";
import {
  applyCallV4NativeIncomingSurfaceSignal,
  hasCallV4NativeIncomingSurfaceForCall,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";

describe("call-v4 native lifecycle", () => {
  beforeEach(() => {
    nativeMocks.stopNative.mockReset();
    nativeMocks.markConsumed.mockReset();
    nativeMocks.getPlugin.mockReset();
    nativeMocks.getPlugin.mockResolvedValue({
      markCallConsumed: nativeMocks.markConsumed,
    });
    resetCallV4NativeLifecycleClaimsForTests();
    applyCallV4NativeIncomingSurfaceSignal({
      callId: "call-reset",
      hasNativeIncomingSurface: false,
      source: "test_reset",
    });
  });

  it("syncCallV4NativeOnWebAccept stops ring and requests consumed sync", () => {
    syncCallV4NativeOnWebAccept("call-accept");
    expect(nativeMocks.stopNative).toHaveBeenCalledWith("call-accept");
  });

  it("syncCallV4NativeOnWebReject stops ring and requests declined consumed sync", () => {
    syncCallV4NativeOnWebReject("call-reject");
    expect(nativeMocks.stopNative).toHaveBeenCalledWith("call-reject");
  });

  it("requestCallV4NativeConsumedSync is idempotent for same callId+reason", async () => {
    requestCallV4NativeConsumedSync("call-idem", "ended");
    requestCallV4NativeConsumedSync("call-idem", "ended");
    await new Promise((r) => setTimeout(r, 0));
    expect(nativeMocks.markConsumed).toHaveBeenCalledTimes(1);
  });

  it("syncCallV4NativeTerminalCleanup clears native incoming surface", () => {
    applyCallV4NativeIncomingSurfaceSignal({
      callId: "call-term",
      hasNativeIncomingSurface: true,
      nativeSurfaceType: "fullscreen_intent",
      source: "test",
    });
    expect(hasCallV4NativeIncomingSurfaceForCall("call-term")).toBe(true);
    syncCallV4NativeTerminalCleanup("call-term", "ended");
    expect(hasCallV4NativeIncomingSurfaceForCall("call-term")).toBe(false);
    expect(nativeMocks.stopNative).toHaveBeenCalledWith("call-term");
  });

  it("requestCallV4NativeRingStop can be called multiple times safely", () => {
    requestCallV4NativeRingStop("call-ring", "accept");
    requestCallV4NativeRingStop("call-ring", "accept");
    expect(nativeMocks.stopNative).toHaveBeenCalledTimes(2);
  });
});
