import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  armBn14DirectColdNavigation,
  getBn14DirectColdSession,
  noteBn14DirectColdMark,
  resetBn14DirectColdProbeForTests,
} from "@/lib/community-messenger/room/cm-room-bn14-direct-cold-probe";

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

describe("cm-room-bn14-direct-cold-probe", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    mockSessionStorage();
    sessionStorage.setItem("samarket:debug:runtime", "1");
    resetBn14DirectColdProbeForTests();
    let t = 1000;
    vi.stubGlobal("performance", { now: () => (t += 5) });
  });

  afterEach(() => {
    resetBn14DirectColdProbeForTests();
    vi.unstubAllGlobals();
  });

  it("arms direct nav and records marks once", () => {
    armBn14DirectColdNavigation();
    noteBn14DirectColdMark("segment_layout_mount");
    noteBn14DirectColdMark("segment_layout_mount");
    const session = getBn14DirectColdSession();
    expect(session.direct_nav).toBe(true);
    expect(session.marks.segment_layout_mount).toBe(1005);
  });
});
