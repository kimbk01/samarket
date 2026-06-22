import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllCommunityCallLocalSessionFlags,
  dockCommunityCall,
  enterAndroidOsPipCommunityCall,
  expandCommunityCallFromAndroidOsPip,
  expandCommunityCallFromDock,
  expandCommunityCallFromPip,
  forceDisposeDetachedCommunityCall,
  isTerminalSuppressedPresentation,
  minimizeCommunityCallToPip,
  readAndroidOsPipCallSessionId,
  readDockedCallSessionId,
  readHostedActiveCallSessionId,
  readPipMinimizedCallSessionId,
  resolveCallPresentationSurface,
  resolveHostedCallPresentation,
  shouldSkipCallClientUnmountDispose,
  writeHostedActiveCallSession,
} from "@/lib/community-messenger/call-presentation-ownership";
import { pinCommunityMessengerCallTerminalSurfaceDismiss } from "@/lib/community-messenger/call-session-navigation-seed";
import { resetCallEngineForTest, resolveCallSurfaceOwner, syncCallEngineStateFromSession } from "@/lib/community-messenger/call-engine";

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

function createWindowStub(sessionStorage: Storage): Window {
  return {
    sessionStorage,
    localStorage: sessionStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    location: { pathname: "/community-messenger/calls/test", search: "" } as Location,
  } as unknown as Window;
}

describe("call presentation ownership (GOOD baseline)", () => {
  beforeEach(() => {
    const storage = createSessionStorageStub();
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("window", createWindowStub(storage));
  });

  afterEach(async () => {
    await forceDisposeDetachedCommunityCall();
    clearAllCommunityCallLocalSessionFlags();
    resetCallEngineForTest();
    vi.unstubAllGlobals();
  });

  it("A: connected full -> dock", () => {
    writeHostedActiveCallSession("call-a");
    dockCommunityCall({ sessionId: "call-a", roomId: "room-a", cleanup: vi.fn(async () => {}) });
    expect(readDockedCallSessionId()).toBe("call-a");
    expect(readPipMinimizedCallSessionId()).toBeNull();
    expect(resolveHostedCallPresentation("call-a")).toBe("dock");
  });

  it("B: connected full -> pip", () => {
    writeHostedActiveCallSession("call-b");
    minimizeCommunityCallToPip({ sessionId: "call-b", roomId: "room-b", cleanup: vi.fn(async () => {}) });
    expect(readPipMinimizedCallSessionId()).toBe("call-b");
    expect(readDockedCallSessionId()).toBeNull();
    expect(resolveHostedCallPresentation("call-b")).toBe("pip-minimized");
  });

  it("C: dock -> full", () => {
    dockCommunityCall({ sessionId: "call-c", roomId: "room-c", cleanup: vi.fn(async () => {}) });
    expandCommunityCallFromDock("call-c");
    expect(readDockedCallSessionId()).toBeNull();
    expect(readHostedActiveCallSessionId()).toBe("call-c");
    expect(resolveHostedCallPresentation("call-c")).toBe("fullscreen");
  });

  it("D: pip -> full", () => {
    minimizeCommunityCallToPip({ sessionId: "call-d", roomId: "room-d", cleanup: vi.fn(async () => {}) });
    expandCommunityCallFromPip("call-d");
    expect(readPipMinimizedCallSessionId()).toBeNull();
    expect(readHostedActiveCallSessionId()).toBe("call-d");
    expect(resolveHostedCallPresentation("call-d")).toBe("fullscreen");
  });

  it("E: dock end -> terminal + dock removed", () => {
    dockCommunityCall({ sessionId: "call-e", roomId: "room-e", cleanup: vi.fn(async () => {}) });
    pinCommunityMessengerCallTerminalSurfaceDismiss("call-e");
    expect(readDockedCallSessionId()).toBeNull();
    expect(readHostedActiveCallSessionId()).toBeNull();
    expect(isTerminalSuppressedPresentation("call-e")).toBe(true);
  });

  it("F: pip end -> terminal + pip removed", () => {
    minimizeCommunityCallToPip({ sessionId: "call-f", roomId: "room-f", cleanup: vi.fn(async () => {}) });
    pinCommunityMessengerCallTerminalSurfaceDismiss("call-f");
    expect(readPipMinimizedCallSessionId()).toBeNull();
    expect(readHostedActiveCallSessionId()).toBeNull();
    expect(isTerminalSuppressedPresentation("call-f")).toBe(true);
  });

  it("G: terminal 이후 dock/pip 재표시 금지", () => {
    dockCommunityCall({ sessionId: "call-g", roomId: "room-g", cleanup: vi.fn(async () => {}) });
    pinCommunityMessengerCallTerminalSurfaceDismiss("call-g");
    expect(resolveHostedCallPresentation("call-g")).toBeNull();
    expect(shouldSkipCallClientUnmountDispose("call-g")).toBe(false);
  });

  it("H: old callId minimized/docked state does not affect new callId", () => {
    dockCommunityCall({ sessionId: "old-call", roomId: "room-old", cleanup: vi.fn(async () => {}) });
    minimizeCommunityCallToPip({ sessionId: "new-call", roomId: "room-new", cleanup: vi.fn(async () => {}) });
    expect(resolveHostedCallPresentation("old-call")).toBeNull();
    expect(resolveHostedCallPresentation("new-call")).toBe("pip-minimized");
  });

  it("I: sequential calls keep dock/pip healthy + lockdown does not block presentation", () => {
    minimizeCommunityCallToPip({ sessionId: "seq-1", roomId: "room-1", cleanup: vi.fn(async () => {}) });
    pinCommunityMessengerCallTerminalSurfaceDismiss("seq-1");
    dockCommunityCall({ sessionId: "seq-2", roomId: "room-2", cleanup: vi.fn(async () => {}) });
    syncCallEngineStateFromSession("seq-2", "active", false);

    expect(resolveHostedCallPresentation("seq-2")).toBe("dock");
    const owner = resolveCallSurfaceOwner({
      callId: "seq-2",
      appVisibility: "foreground",
      hasNativeFsi: false,
      requestOwner: "dock_or_pip",
    });
    expect(owner).toBe("dock_or_pip");
  });

  it("J: full -> android_os_pip -> full", () => {
    writeHostedActiveCallSession("call-j");
    enterAndroidOsPipCommunityCall({ sessionId: "call-j", roomId: "room-j", cleanup: vi.fn(async () => {}) });
    expect(resolveCallPresentationSurface("call-j")).toBe("ANDROID_OS_PIP");
    expect(readAndroidOsPipCallSessionId()).toBe("call-j");
    expandCommunityCallFromAndroidOsPip("call-j");
    expect(readAndroidOsPipCallSessionId()).toBeNull();
    expect(resolveCallPresentationSurface("call-j")).toBe("FULLSCREEN");
  });

  it("K: retained dock blocks runtime reset guard", async () => {
    const { shouldBlockCallRuntimeSurfaceReset } = await import(
      "@/lib/community-messenger/call-presentation-surface"
    );
    const {
      forceResetCommunityMessengerCallRuntimeSurface,
      getCommunityMessengerCallRuntimeSurface,
      resetCommunityMessengerCallRuntimeSurface,
      syncCommunityMessengerCallRuntimeSurface,
    } = await import("@/lib/community-messenger/call-runtime-registry");
    dockCommunityCall({ sessionId: "call-k", roomId: "room-k", cleanup: vi.fn(async () => {}) });
    syncCommunityMessengerCallRuntimeSurface({ presentation: "dock" });
    expect(shouldBlockCallRuntimeSurfaceReset()).toBe(true);
    resetCommunityMessengerCallRuntimeSurface();
    expect(getCommunityMessengerCallRuntimeSurface().presentation).toBe("dock");
    forceResetCommunityMessengerCallRuntimeSurface();
    expect(getCommunityMessengerCallRuntimeSurface().presentation).toBe("idle");
  });

  it("L: route unmount retain — dock keeps skip dispose", () => {
    dockCommunityCall({ sessionId: "call-l", roomId: "room-l", cleanup: vi.fn(async () => {}) });
    expect(shouldSkipCallClientUnmountDispose("call-l")).toBe(true);
  });
});
