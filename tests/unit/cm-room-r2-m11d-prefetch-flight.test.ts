import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  noteR2M11DRoomPrefetchStart,
  noteR2M11DRoomPushStart,
  noteR2M11DRoomRouteChange,
  noteR2M11DRoomRscFlightDone,
  noteR2M11DRoomSuspenseRelease,
  resetR2M11DPrefetchFlightForTests,
} from "@/lib/community-messenger/room/cm-room-r2-m11d-prefetch-flight";

function mockSessionStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  });
}

describe("cm-room-r2-m11d-prefetch-flight", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    mockSessionStorage();
    sessionStorage.setItem("samarket:debug:runtime", "1");
    resetR2M11DPrefetchFlightForTests();
    let t = 1000;
    vi.stubGlobal("performance", { now: () => (t += 10) });
  });

  afterEach(() => {
    resetR2M11DPrefetchFlightForTests();
    vi.unstubAllGlobals();
  });

  it("records push before prefetch done and emits breakdown", () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].includes("[R2-M11D-BREAKDOWN]")) {
        logs.push(String(args[0]));
      }
      orig(...args);
    };
    try {
      noteR2M11DRoomPrefetchStart("room-d", "/community-messenger/rooms/room-d", "pointerdown");
      noteR2M11DRoomPushStart("room-d");
      noteR2M11DRoomRscFlightDone("room-d");
      noteR2M11DRoomRouteChange("room-d");
      noteR2M11DRoomSuspenseRelease("room-d");
      expect(logs.length).toBeGreaterThan(0);
      const m = logs[0]!.match(/\[R2-M11D-BREAKDOWN\]\s*(\{.+)/);
      const payload = JSON.parse(m![1]!);
      expect(payload.route_push_before_prefetch_done).toBe(false);
    } finally {
      console.log = orig;
    }
  });
});
