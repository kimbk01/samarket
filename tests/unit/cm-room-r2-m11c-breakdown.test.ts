import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  judgeR2M11CVerdictCategory,
  type R2M11CLayoutServerPayload,
} from "@/lib/community-messenger/room/cm-room-r2-m11c-layout-server-timers";
import {
  noteR2M11CLayoutServerPayload,
  noteR2M11CRoomSegmentServerTiming,
  resetR2M11CBreakdownForTests,
  tryEmitR2M11CAfterM11BPhase,
} from "@/lib/community-messenger/room/cm-room-r2-m11c-breakdown";
import {
  noteR2M11BFlightResponseDone,
  noteR2M11BFlightResponseStart,
  noteR2M11BRouteChangeStart,
  noteR2M11BSuspenseRelease,
  resetR2M11BBreakdownForTests,
} from "@/lib/community-messenger/room/cm-room-r2-m11b-breakdown";

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

const baseLayout = (): R2M11CLayoutServerPayload => ({
  layout_entry_ms: 0,
  headers_cookies_ms: 0,
  headers_cookies_invoked: false,
  auth_profile_await_ms: 0,
  auth_profile_invoked: false,
  bottom_nav_load_start_ms: 1,
  bottom_nav_load_done_ms: 4,
  bottom_nav_load_ms: 3,
  menu_load_start_ms: 1,
  menu_load_done_ms: 4,
  menu_load_ms: 3,
  children_render_before_ms: 5,
  main_layout_server_done_ms: 5,
  main_layout_total_ms: 5,
  parallel_bottleneck_ms: 3,
});

describe("cm-room-r2-m11c-breakdown", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    mockSessionStorage();
    sessionStorage.setItem("samarket:debug:runtime", "1");
    resetR2M11BBreakdownForTests();
    resetR2M11CBreakdownForTests();
    let t = 1000;
    vi.stubGlobal("performance", { now: () => (t += 10) });
  });

  afterEach(() => {
    resetR2M11BBreakdownForTests();
    resetR2M11CBreakdownForTests();
    vi.unstubAllGlobals();
  });

  it("emits marks and next_rsc_flight verdict when layout/nav are fast", () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].includes("[R2-M11C-BREAKDOWN]")) {
        logs.push(String(args[0]));
      }
      orig(...args);
    };
    try {
      noteR2M11BRouteChangeStart("room-c");
      noteR2M11CLayoutServerPayload("room-c", baseLayout());
      noteR2M11CRoomSegmentServerTiming("room-c", {
        room_segment_server_start_ms: 0,
        room_segment_server_done_ms: 0,
        room_segment_server_wall_ms: 0,
      });
      noteR2M11BFlightResponseStart("room-c", 1120);
      noteR2M11BFlightResponseDone("room-c", 1500);
      noteR2M11BSuspenseRelease("room-c");
      tryEmitR2M11CAfterM11BPhase("room-c");
      const m = logs[0]!.match(/\[R2-M11C-BREAKDOWN\]\s*(\{.+)/);
      const payload = JSON.parse(m![1]!);
      expect(payload.marks.room_segment_server_done_ms).toBe(0);
      expect(payload.verdict_category).toBe("next_rsc_flight");
    } finally {
      console.log = orig;
    }
  });

  it("judges bottom_nav_menu when nav load exceeds threshold", () => {
    expect(
      judgeR2M11CVerdictCategory({
        main_layout_total_ms: 200,
        bottom_nav_load_ms: 120,
        menu_load_ms: 10,
        auth_profile_await_ms: 0,
        auth_profile_invoked: false,
        remaining_flight_gap_ms: 50,
        rsc_flight_ms: 200,
      })
    ).toBe("bottom_nav_menu");
  });
});
