import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  noteR2M11BRouteChangeStart,
  noteR2M11BFlightResponseStart,
  noteR2M11BFlightResponseDone,
  noteR2M11BSuspenseRelease,
  noteR2M11BFirstClientBoundaryMount,
  noteR2M11BPhase1Visible,
  noteR2M11BRoomPageServerWallMs,
  resetR2M11BBreakdownForTests,
} from "@/lib/community-messenger/room/cm-room-r2-m11b-breakdown";

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

describe("cm-room-r2-m11b-breakdown", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    mockSessionStorage();
    sessionStorage.setItem("samarket:debug:runtime", "1");
    resetR2M11BBreakdownForTests();
    let t = 1000;
    vi.stubGlobal("performance", {
      now: () => {
        t += 10;
        return t;
      },
    });
  });

  afterEach(() => {
    resetR2M11BBreakdownForTests();
    vi.unstubAllGlobals();
  });

  it("emits segment deltas once phase1_visible", () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].includes("[R2-M11B-BREAKDOWN]")) {
        logs.push(String(args[0]));
      }
      orig(...args);
    };
    try {
      noteR2M11BRouteChangeStart("room-b");
      noteR2M11BRoomPageServerWallMs("room-b", 2);
      noteR2M11BFlightResponseStart("room-b", 1120);
      noteR2M11BFlightResponseDone("room-b", 1300);
      noteR2M11BSuspenseRelease("room-b");
      noteR2M11BFirstClientBoundaryMount("room-b");
      noteR2M11BPhase1Visible("room-b");
      expect(logs.length).toBeGreaterThan(0);
      const m = logs[0]!.match(/\[R2-M11B-BREAKDOWN\]\s*(\{.+)/);
      const payload = JSON.parse(m![1]!);
      expect(payload.server_start_to_server_done_ms).toBe(2);
      expect(payload.flight_response_ms).toBe(180);
    } finally {
      console.log = orig;
    }
  });
});
