import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAllCommunityCallLocalSessionFlags,
  dockCommunityCall,
  enterAndroidOsPipCommunityCall,
  forceDisposeDetachedCommunityCall,
} from "@/lib/community-messenger/call-presentation-ownership";
import {
  isAndroidOsPipSafeLayoutActive,
  readAndroidOsPipSafeLayoutSessionId,
  shouldUseAndroidOsPipSafeLayout,
} from "@/lib/community-messenger/call-android-os-pip-layout";

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

describe("call android os pip safe layout SSOT", () => {
  beforeEach(() => {
    const storage = createSessionStorageStub();
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("window", createWindowStub(storage));
  });

  afterEach(async () => {
    await forceDisposeDetachedCommunityCall();
    clearAllCommunityCallLocalSessionFlags();
    vi.unstubAllGlobals();
  });

  it("activates only for ANDROID_OS_PIP surface", () => {
    expect(shouldUseAndroidOsPipSafeLayout("call-a")).toBe(false);
    expect(isAndroidOsPipSafeLayoutActive("call-a")).toBe(false);

    enterAndroidOsPipCommunityCall({
      sessionId: "call-a",
      roomId: "room-a",
      cleanup: vi.fn(async () => {}),
    });

    expect(readAndroidOsPipSafeLayoutSessionId()).toBe("call-a");
    expect(shouldUseAndroidOsPipSafeLayout("call-a")).toBe(true);
    expect(isAndroidOsPipSafeLayoutActive("call-a")).toBe(true);
    expect(isAndroidOsPipSafeLayoutActive("call-b")).toBe(false);
  });

  it("does not activate for dock fallback surface", () => {
    dockCommunityCall({
      sessionId: "call-d",
      roomId: "room-d",
      cleanup: vi.fn(async () => {}),
    });
    expect(shouldUseAndroidOsPipSafeLayout("call-d")).toBe(false);
    expect(isAndroidOsPipSafeLayoutActive()).toBe(false);
  });
});
