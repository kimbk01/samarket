import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canRetainCommunityCallPresentation,
  clearAllCommunityCallLocalSessionFlags,
  dockCommunityCall,
  expandCommunityCallFromDock,
  expandCommunityCallFromPip,
  forceDisposeDetachedCommunityCall,
  minimizeCommunityCallToPip,
  peekDetachedCommunityCallSessionId,
  readDockedCallSessionId,
  readHostedActiveCallSessionId,
  readPipMinimizedCallSessionId,
  resolveHostedCallPresentation,
  shouldPreserveCallRuntimeSurfaceOnUnmount,
  writeHostedActiveCallSession,
} from "@/lib/community-messenger/call-presentation-ownership";
import {
  getCommunityMessengerCallRuntimeSurface,
  resetCommunityMessengerCallRuntimeSurface,
  syncCommunityMessengerCallRuntimeSurface,
} from "@/lib/community-messenger/call-runtime-registry";
import { cleanupCommunityCallTerminal } from "@/lib/community-messenger/call-terminal-cleanup";

vi.mock("@/lib/call/native/native-call-service", () => ({
  endNativeCallService: vi.fn(async () => true),
  reportNativeCallRemoteEnded: vi.fn(async () => true),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => ({ id: "user-1", phone_verified: true }),
}));

vi.mock("@/lib/auth/phone-verification-required-client", () => ({
  openPhoneVerificationRequiredSheet: vi.fn(),
}));

vi.mock("@/lib/auth/assert-phone-verified-for-messenger-action-client", () => ({
  assertPhoneVerifiedForMessengerActionOrOpenSheet: () => true,
  resolveMessengerActionReturnPath: () => "/community-messenger",
}));

function createSessionStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe("call-presentation-ownership", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", createSessionStorageStub());
    resetCommunityMessengerCallRuntimeSurface();
  });

  afterEach(async () => {
    await forceDisposeDetachedCommunityCall();
    clearAllCommunityCallLocalSessionFlags();
    resetCommunityMessengerCallRuntimeSurface();
    vi.unstubAllGlobals();
  });

  it("full -> dock clears pip and keeps only dock presentation", () => {
    writeHostedActiveCallSession("session-1");
    minimizeCommunityCallToPip({ sessionId: "session-1", roomId: "room-1", cleanup: vi.fn() });

    dockCommunityCall({ sessionId: "session-1", roomId: "room-1", cleanup: vi.fn() });

    expect(readHostedActiveCallSessionId()).toBe("session-1");
    expect(readDockedCallSessionId()).toBe("session-1");
    expect(readPipMinimizedCallSessionId()).toBeNull();
    expect(resolveHostedCallPresentation("session-1")).toBe("dock");
  });

  it("full -> pip clears dock and keeps only pip presentation", () => {
    writeHostedActiveCallSession("session-1");
    dockCommunityCall({ sessionId: "session-1", roomId: "room-1", cleanup: vi.fn() });

    minimizeCommunityCallToPip({ sessionId: "session-1", roomId: "room-1", cleanup: vi.fn() });

    expect(readHostedActiveCallSessionId()).toBe("session-1");
    expect(readDockedCallSessionId()).toBeNull();
    expect(readPipMinimizedCallSessionId()).toBe("session-1");
    expect(resolveHostedCallPresentation("session-1")).toBe("pip-minimized");
  });

  it("dock -> full removes dock presentation", () => {
    dockCommunityCall({ sessionId: "session-1", roomId: "room-1", cleanup: vi.fn() });

    expandCommunityCallFromDock("session-1");

    expect(readDockedCallSessionId()).toBeNull();
    expect(readPipMinimizedCallSessionId()).toBeNull();
    expect(readHostedActiveCallSessionId()).toBe("session-1");
    expect(resolveHostedCallPresentation("session-1")).toBe("fullscreen");
  });

  it("pip -> full removes pip presentation", () => {
    minimizeCommunityCallToPip({ sessionId: "session-1", roomId: "room-1", cleanup: vi.fn() });

    expandCommunityCallFromPip("session-1");

    expect(readPipMinimizedCallSessionId()).toBeNull();
    expect(readDockedCallSessionId()).toBeNull();
    expect(readHostedActiveCallSessionId()).toBe("session-1");
    expect(resolveHostedCallPresentation("session-1")).toBe("fullscreen");
  });

  it("dock and pip are mutually exclusive across presentation changes", () => {
    dockCommunityCall({ sessionId: "session-1", roomId: "room-1", cleanup: vi.fn() });
    minimizeCommunityCallToPip({ sessionId: "session-1", roomId: "room-1", cleanup: vi.fn() });

    expect(readDockedCallSessionId()).toBeNull();
    expect(readPipMinimizedCallSessionId()).toBe("session-1");

    dockCommunityCall({ sessionId: "session-1", roomId: "room-1", cleanup: vi.fn() });

    expect(readDockedCallSessionId()).toBe("session-1");
    expect(readPipMinimizedCallSessionId()).toBeNull();
  });

  it("new session presentation does not leave stale flags from the previous session", () => {
    dockCommunityCall({ sessionId: "session-old", roomId: "room-old", cleanup: vi.fn() });

    minimizeCommunityCallToPip({ sessionId: "session-new", roomId: "room-new", cleanup: vi.fn() });

    expect(readDockedCallSessionId()).toBeNull();
    expect(readPipMinimizedCallSessionId()).toBe("session-new");
    expect(readHostedActiveCallSessionId()).toBe("session-new");
    expect(resolveHostedCallPresentation("session-old")).toBeNull();
    expect(resolveHostedCallPresentation("session-new")).toBe("pip-minimized");
  });

  it("terminal stale dispose clears dock, pip, hosted, and detached ownership", async () => {
    const cleanup = vi.fn(async () => {});
    dockCommunityCall({ sessionId: "session-terminal", roomId: "room-1", cleanup });

    await forceDisposeDetachedCommunityCall();

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(readDockedCallSessionId()).toBeNull();
    expect(readPipMinimizedCallSessionId()).toBeNull();
    expect(readHostedActiveCallSessionId()).toBeNull();
    expect(peekDetachedCommunityCallSessionId()).toBeNull();
  });

  it("retained presentation is allowed only for active direct joined calls", () => {
    expect(
      canRetainCommunityCallPresentation({
        status: "ringing",
        sessionMode: "direct",
        joined: true,
      })
    ).toBe(false);
    expect(
      canRetainCommunityCallPresentation({
        status: "active",
        sessionMode: "group",
        joined: true,
      })
    ).toBe(false);
    expect(
      canRetainCommunityCallPresentation({
        status: "active",
        sessionMode: "direct",
        joined: false,
      })
    ).toBe(false);
    expect(
      canRetainCommunityCallPresentation({
        status: "active",
        sessionMode: "direct",
        joined: true,
      })
    ).toBe(true);
  });

  it("retained unmount preserves runtime surface instead of resetting it", () => {
    dockCommunityCall({ sessionId: "session-retained", roomId: "room-1", cleanup: vi.fn() });
    syncCommunityMessengerCallRuntimeSurface({ presentation: "dock" });

    if (!shouldPreserveCallRuntimeSurfaceOnUnmount("session-retained")) {
      resetCommunityMessengerCallRuntimeSurface();
    }

    expect(getCommunityMessengerCallRuntimeSurface().presentation).toBe("dock");
  });

  it("explicit terminal cleanup resets runtime surface", async () => {
    dockCommunityCall({ sessionId: "session-ended", roomId: "room-1", cleanup: vi.fn() });
    syncCommunityMessengerCallRuntimeSurface({ presentation: "dock" });

    await cleanupCommunityCallTerminal({
      sessionId: "session-ended",
      reason: "ended",
      source: "test_explicit_end",
    });

    expect(readDockedCallSessionId()).toBeNull();
    expect(readPipMinimizedCallSessionId()).toBeNull();
    expect(readHostedActiveCallSessionId()).toBeNull();
    expect(getCommunityMessengerCallRuntimeSurface().presentation).toBe("idle");
  });
});
