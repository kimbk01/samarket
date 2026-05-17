import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  noteR2M11Phase1Visible,
  noteR2M11RouteChangeStart,
  noteR2M11SegmentLoadingFallbackVisible,
  noteR2M11SuspenseRelease,
  resetR2M11SuspenseReleaseForTests,
} from "@/lib/community-messenger/room/cm-room-r2-m11-suspense-release";

function mockSessionStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  });
  return store;
}

describe("cm-room-r2-m11-suspense-release", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    mockSessionStorage();
    sessionStorage.setItem("samarket:debug:runtime", "1");
    resetR2M11SuspenseReleaseForTests();
    let t = 1000;
    vi.stubGlobal("performance", { now: () => t });
  });

  afterEach(() => {
    resetR2M11SuspenseReleaseForTests();
    vi.unstubAllGlobals();
  });

  it("records route_change → release → phase1_visible breakdown once", () => {
    noteR2M11RouteChangeStart("room-a");
    noteR2M11SegmentLoadingFallbackVisible();
    noteR2M11SuspenseRelease("room-a");
    noteR2M11Phase1Visible("room-a");
    noteR2M11Phase1Visible("room-a");

    const g = globalThis as { __samarketAppWidePhaseLastMs?: Record<string, number> };
    expect(g.__samarketAppWidePhaseLastMs?.r2m11_route_suspense_release_ms).toBe(0);
    expect(g.__samarketAppWidePhaseLastMs?.r2m11_route_phase1_visible_ms).toBe(0);
    expect(sessionStorage.getItem("samarket:cm:r2m11:breakdown_done:room-a")).toBe("1");
  });
});
