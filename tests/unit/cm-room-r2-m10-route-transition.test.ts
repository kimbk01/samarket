import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as snapshotCache from "@/lib/community-messenger/room-snapshot-cache";
import {
  beginR2M10ListTap,
  messengerRoomNavPrefetchTapState,
  noteR2M10RoutePageMount,
  noteR2M10RouterPushDone,
  noteR2M10RouterPushStart,
  resetR2M10RouteTransitionForTests,
} from "@/lib/community-messenger/room/cm-room-r2-m10-route-transition";
import { markRoomTapAtClick } from "@/lib/community-messenger/room/cm-room-entry-timing";

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

describe("cm-room-r2-m10-route-transition", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { setTimeout: (fn: () => void) => fn() });
    mockSessionStorage();
    sessionStorage.setItem("samarket:debug:runtime", "1");
    resetR2M10RouteTransitionForTests();
    let t = 1000;
    vi.stubGlobal("performance", {
      now: () => t,
    });
    vi.spyOn(snapshotCache, "isRoomSnapshotFresh").mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("records route_mount_gap_ms after page mount", () => {
    markRoomTapAtClick("room-a");
    beginR2M10ListTap("room-a", "viewer-1", "/community-messenger/rooms/room-a");
    noteR2M10RouterPushStart("room-a");
    (performance.now as () => number) = () => 1150;
    noteR2M10RouterPushDone("room-a");
    (performance.now as () => number) = () => 1280;
    noteR2M10RoutePageMount("room-a");

    const g = globalThis as { __samarketAppWidePhaseLastMs?: Record<string, number> };
    expect(g.__samarketAppWidePhaseLastMs?.r2m10_route_mount_gap_ms).toBe(280);
  });

  it("resolves prefetch_hit when snapshot is fresh", () => {
    vi.mocked(snapshotCache.isRoomSnapshotFresh).mockReturnValue(true);
    const state = messengerRoomNavPrefetchTapState("room-b", "viewer");
    expect(state.prefetch_hit).toBe(true);
    expect(state.snapshot_fresh).toBe(true);
  });
});
