import { beforeEach, describe, expect, it, vi } from "vitest";

const isCapacitorNativePlatform = vi.fn(() => false);
const resolveCapacitorShellPlatform = vi.fn(() => "web" as "web" | "android" | "ios");
const isAndroidNativeOutgoingShell = vi.fn(() => false);
const isIOSNativeOutgoingShell = vi.fn(async () => false);
const isIOSNativeVideoOutgoingShell = vi.fn(async () => false);

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => isCapacitorNativePlatform(),
  resolveCapacitorShellPlatform: () => resolveCapacitorShellPlatform(),
}));

vi.mock("@/lib/call/native/native-outgoing-bridge", () => ({
  isAndroidNativeOutgoingShell: () => isAndroidNativeOutgoingShell(),
  isIOSNativeOutgoingShell: () => isIOSNativeOutgoingShell(),
  isIOSNativeVideoOutgoingShell: () => isIOSNativeVideoOutgoingShell(),
}));

import {
  invalidateWebOutgoingRingbackOwnership,
  resetWebOutgoingRingbackOwnershipForTests,
  shouldSkipWebOutgoingRingbackAsync,
  shouldSkipWebOutgoingRingbackSync,
  startWebOutgoingRingbackIfAllowed,
} from "@/lib/community-messenger/call-outgoing-ringback-ownership";

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

describe("call-outgoing-ringback-ownership", () => {
  beforeEach(() => {
    resetWebOutgoingRingbackOwnershipForTests();
    vi.clearAllMocks();
    isCapacitorNativePlatform.mockReturnValue(false);
    resolveCapacitorShellPlatform.mockReturnValue("web");
    isAndroidNativeOutgoingShell.mockReturnValue(false);
    isIOSNativeOutgoingShell.mockResolvedValue(false);
    isIOSNativeVideoOutgoingShell.mockResolvedValue(false);
  });

  describe("platform matrix", () => {
    it("Web: Sync false, Async false, Web start 1", () => {
      const start = vi.fn();
      expect(shouldSkipWebOutgoingRingbackSync("voice")).toBe(false);
      const gate = startWebOutgoingRingbackIfAllowed({
        kind: "voice",
        callId: "c-web",
        isStillValid: () => true,
        start,
      });
      expect(gate).toBe("started");
      expect(start).toHaveBeenCalledTimes(1);
      expect(isIOSNativeOutgoingShell).not.toHaveBeenCalled();
    });

    it("Android native: Sync true, Web start 0, no iOS Async bridge", () => {
      isCapacitorNativePlatform.mockReturnValue(true);
      resolveCapacitorShellPlatform.mockReturnValue("android");
      isAndroidNativeOutgoingShell.mockReturnValue(true);
      const start = vi.fn();
      expect(shouldSkipWebOutgoingRingbackSync("voice")).toBe(true);
      expect(shouldSkipWebOutgoingRingbackSync("video")).toBe(true);
      const gate = startWebOutgoingRingbackIfAllowed({
        kind: "voice",
        callId: "c-and",
        isStillValid: () => true,
        start,
      });
      expect(gate).toBe("skipped_native");
      expect(start).not.toHaveBeenCalled();
      expect(isIOSNativeOutgoingShell).not.toHaveBeenCalled();
      expect(isIOSNativeVideoOutgoingShell).not.toHaveBeenCalled();
    });

    it("Android handoff not native: Sync false, Web start 1, no iOS Async", async () => {
      isCapacitorNativePlatform.mockReturnValue(true);
      resolveCapacitorShellPlatform.mockReturnValue("android");
      isAndroidNativeOutgoingShell.mockReturnValue(false);
      const start = vi.fn();
      expect(await shouldSkipWebOutgoingRingbackAsync("voice")).toBe(false);
      const gate = startWebOutgoingRingbackIfAllowed({
        kind: "video",
        callId: "c-and-fb",
        isStillValid: () => true,
        start,
      });
      expect(gate).toBe("started");
      expect(start).toHaveBeenCalledTimes(1);
      expect(isIOSNativeOutgoingShell).not.toHaveBeenCalled();
    });

    it("iOS native voice: Async true, Web start 0", async () => {
      isCapacitorNativePlatform.mockReturnValue(true);
      resolveCapacitorShellPlatform.mockReturnValue("ios");
      isIOSNativeOutgoingShell.mockResolvedValue(true);
      const start = vi.fn();
      expect(shouldSkipWebOutgoingRingbackSync("voice")).toBe(false);
      expect(await shouldSkipWebOutgoingRingbackAsync("voice")).toBe(true);
      const gate = startWebOutgoingRingbackIfAllowed({
        kind: "voice",
        callId: "c-ios",
        isStillValid: () => true,
        start,
      });
      expect(gate).toBe("pending");
      expect(start).not.toHaveBeenCalled();
      await flushMicrotasks();
      expect(start).not.toHaveBeenCalled();
      expect(isIOSNativeOutgoingShell).toHaveBeenCalled();
    });

    it("iOS native video: Async true, Web start 0", async () => {
      isCapacitorNativePlatform.mockReturnValue(true);
      resolveCapacitorShellPlatform.mockReturnValue("ios");
      isIOSNativeVideoOutgoingShell.mockResolvedValue(true);
      const start = vi.fn();
      const gate = startWebOutgoingRingbackIfAllowed({
        kind: "video",
        callId: "c-ios-v",
        isStillValid: () => true,
        start,
      });
      expect(gate).toBe("pending");
      await flushMicrotasks();
      expect(start).not.toHaveBeenCalled();
      expect(isIOSNativeVideoOutgoingShell).toHaveBeenCalled();
      expect(isIOSNativeOutgoingShell).not.toHaveBeenCalled();
    });

    it("iOS native handoff false: Web start 1", async () => {
      isCapacitorNativePlatform.mockReturnValue(true);
      resolveCapacitorShellPlatform.mockReturnValue("ios");
      isIOSNativeOutgoingShell.mockResolvedValue(false);
      const start = vi.fn();
      startWebOutgoingRingbackIfAllowed({
        kind: "voice",
        callId: "c-ios-fb",
        isStillValid: () => true,
        start,
      });
      await flushMicrotasks();
      expect(start).toHaveBeenCalledTimes(1);
    });

    it("iOS ownership exception: Web fallback max 1", async () => {
      isCapacitorNativePlatform.mockReturnValue(true);
      resolveCapacitorShellPlatform.mockReturnValue("ios");
      isIOSNativeOutgoingShell.mockRejectedValue(new Error("bridge_down"));
      const start = vi.fn();
      startWebOutgoingRingbackIfAllowed({
        kind: "voice",
        callId: "c-ios-err",
        isStillValid: () => true,
        start,
      });
      await vi.waitFor(() => {
        expect(start).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("lifecycle / stale Async", () => {
    it("invalidate before Async resolve → Web start 0", async () => {
      isCapacitorNativePlatform.mockReturnValue(true);
      resolveCapacitorShellPlatform.mockReturnValue("ios");
      let resolveLane!: (v: boolean) => void;
      isIOSNativeOutgoingShell.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            resolveLane = resolve;
          })
      );
      const start = vi.fn();
      startWebOutgoingRingbackIfAllowed({
        kind: "voice",
        callId: "c-stale",
        isStillValid: () => true,
        start,
      });
      invalidateWebOutgoingRingbackOwnership("c-stale");
      resolveLane(false);
      await flushMicrotasks();
      expect(start).not.toHaveBeenCalled();
    });

    it("isStillValid false after Async (connected/rejected/cancelled) → Web start 0", async () => {
      isCapacitorNativePlatform.mockReturnValue(true);
      resolveCapacitorShellPlatform.mockReturnValue("ios");
      let resolveLane!: (v: boolean) => void;
      isIOSNativeOutgoingShell.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            resolveLane = resolve;
          })
      );
      let valid = true;
      const start = vi.fn();
      startWebOutgoingRingbackIfAllowed({
        kind: "voice",
        callId: "c-life",
        isStillValid: () => valid,
        start,
      });
      valid = false;
      resolveLane(false);
      await flushMicrotasks();
      expect(start).not.toHaveBeenCalled();
    });

    it("sid replace invalidates previous pending start", async () => {
      isCapacitorNativePlatform.mockReturnValue(true);
      resolveCapacitorShellPlatform.mockReturnValue("ios");
      const resolvers: Array<(v: boolean) => void> = [];
      isIOSNativeOutgoingShell.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            resolvers.push(resolve);
          })
      );
      const startA = vi.fn();
      const startB = vi.fn();
      startWebOutgoingRingbackIfAllowed({
        kind: "voice",
        callId: "sid-a",
        isStillValid: () => true,
        start: startA,
      });
      invalidateWebOutgoingRingbackOwnership("sid-a");
      startWebOutgoingRingbackIfAllowed({
        kind: "voice",
        callId: "sid-b",
        isStillValid: () => true,
        start: startB,
      });
      resolvers[0]?.(false);
      resolvers[1]?.(false);
      await flushMicrotasks();
      expect(startA).not.toHaveBeenCalled();
      expect(startB).toHaveBeenCalledTimes(1);
    });

    it("same sid duplicate schedule → at most one Web start", async () => {
      isCapacitorNativePlatform.mockReturnValue(true);
      resolveCapacitorShellPlatform.mockReturnValue("ios");
      const resolvers: Array<(v: boolean) => void> = [];
      isIOSNativeOutgoingShell.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            resolvers.push(resolve);
          })
      );
      const start = vi.fn();
      startWebOutgoingRingbackIfAllowed({
        kind: "voice",
        callId: "sid-dup",
        isStillValid: () => true,
        start,
      });
      startWebOutgoingRingbackIfAllowed({
        kind: "voice",
        callId: "sid-dup",
        isStillValid: () => true,
        start,
      });
      resolvers[0]?.(false);
      resolvers[1]?.(false);
      await flushMicrotasks();
      expect(start).toHaveBeenCalledTimes(1);
    });
  });

  describe("group / phase2-style", () => {
    it("phase2 native iOS → Web start 0", async () => {
      isCapacitorNativePlatform.mockReturnValue(true);
      resolveCapacitorShellPlatform.mockReturnValue("ios");
      isIOSNativeOutgoingShell.mockResolvedValue(true);
      const start = vi.fn();
      startWebOutgoingRingbackIfAllowed({
        kind: "voice",
        callId: "g-ios",
        isStillValid: () => true,
        start,
      });
      await flushMicrotasks();
      expect(start).not.toHaveBeenCalled();
    });

    it("phase2 native Android → Web start 0", () => {
      isCapacitorNativePlatform.mockReturnValue(true);
      resolveCapacitorShellPlatform.mockReturnValue("android");
      isAndroidNativeOutgoingShell.mockReturnValue(true);
      const start = vi.fn();
      expect(
        startWebOutgoingRingbackIfAllowed({
          kind: "voice",
          callId: "g-and",
          isStillValid: () => true,
          start,
        })
      ).toBe("skipped_native");
      expect(start).not.toHaveBeenCalled();
    });

    it("phase2 Web → Web start 1; repeat evaluation cancelled → no burst", async () => {
      const start = vi.fn();
      let cancelled = false;
      startWebOutgoingRingbackIfAllowed({
        kind: "voice",
        callId: "g-web",
        isStillValid: () => !cancelled,
        start,
      });
      expect(start).toHaveBeenCalledTimes(1);
      cancelled = true;
      invalidateWebOutgoingRingbackOwnership("g-web");
      startWebOutgoingRingbackIfAllowed({
        kind: "voice",
        callId: "g-web",
        isStillValid: () => !cancelled,
        start,
      });
      expect(start).toHaveBeenCalledTimes(1);
      cancelled = false;
      startWebOutgoingRingbackIfAllowed({
        kind: "voice",
        callId: "g-web",
        isStillValid: () => !cancelled,
        start,
      });
      expect(start).toHaveBeenCalledTimes(2);
    });
  });
});
