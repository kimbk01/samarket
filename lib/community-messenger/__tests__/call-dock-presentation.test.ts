import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllCommunityCallLocalSessionFlags,
  dockCommunityCall,
  enterAndroidOsPipCommunityCall,
  forceDisposeDetachedCommunityCall,
} from "@/lib/community-messenger/call-presentation-ownership";
import {
  assertPresentationSurfaceExclusive,
  beginDockEnterTransition,
  commitDockEnterTransition,
  finishFullscreenRestoreFromDock,
  getCallDockPresentationState,
  isCallDockRestoreInFlight,
  resetCallDockPresentation,
  shouldShowCallDockLayer,
  shouldSuppressCallOverlayToasts,
  tryBeginFullscreenRestoreFromDock,
} from "@/lib/community-messenger/call-dock-presentation";

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
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  } as unknown as Window;
}

describe("call dock presentation (PiP/Dock UX stability)", () => {
  beforeEach(() => {
    const storage = createSessionStorageStub();
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("window", createWindowStub(storage));
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      }
    );
    resetCallDockPresentation();
  });

  afterEach(async () => {
    resetCallDockPresentation();
    await forceDisposeDetachedCommunityCall();
    clearAllCommunityCallLocalSessionFlags();
    vi.unstubAllGlobals();
  });

  it("shows dock layer for docked session but not android os pip", () => {
    dockCommunityCall({ sessionId: "call-d", roomId: "room-d", cleanup: vi.fn(async () => {}) });
    expect(shouldShowCallDockLayer()).toBe(true);
    expect(shouldSuppressCallOverlayToasts()).toBe(true);
    expect(assertPresentationSurfaceExclusive("DOCK")).toBe(true);
    expect(assertPresentationSurfaceExclusive("ANDROID_OS_PIP")).toBe(false);

    enterAndroidOsPipCommunityCall({ sessionId: "call-d", roomId: "room-d", cleanup: vi.fn(async () => {}) });
    expect(shouldShowCallDockLayer()).toBe(false);
    expect(assertPresentationSurfaceExclusive("ANDROID_OS_PIP")).toBe(true);
    expect(assertPresentationSurfaceExclusive("DOCK")).toBe(false);
  });

  it("beginDockEnterTransition mounts pending session before flags commit", async () => {
    await beginDockEnterTransition("call-pending");
    expect(getCallDockPresentationState().pendingSessionId).toBe("call-pending");
    expect(getCallDockPresentationState().visualPhase).toBe("visible");
    expect(shouldShowCallDockLayer()).toBe(true);
  });

  it("blocks duplicate fullscreen restore while in flight", async () => {
    commitDockEnterTransition("call-r");
    dockCommunityCall({ sessionId: "call-r", roomId: "room-r", cleanup: vi.fn(async () => {}) });

    expect(tryBeginFullscreenRestoreFromDock()).toBe(true);
    expect(isCallDockRestoreInFlight()).toBe(true);
    expect(tryBeginFullscreenRestoreFromDock()).toBe(false);

    await finishFullscreenRestoreFromDock();
    expect(isCallDockRestoreInFlight()).toBe(false);
    expect(getCallDockPresentationState().visualPhase).toBe("hidden");
  });

  it("suppresses overlay toasts during dock enter transition", async () => {
    expect(shouldSuppressCallOverlayToasts()).toBe(false);
    await beginDockEnterTransition("call-t");
    expect(shouldSuppressCallOverlayToasts()).toBe(true);
    resetCallDockPresentation();
    expect(shouldSuppressCallOverlayToasts()).toBe(false);
  });
});
