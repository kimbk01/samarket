import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MYPAGE_LIST_PAGE_CACHE_MAX_ENTRIES,
  MYPAGE_LIST_PAGE_CACHE_TTL_MS,
  MYPAGE_LIST_SCROLL_TTL_MS,
  buildMypageListRestoreKey,
  consumeMypageListPopstatePending,
  noteMypageListPopstatePending,
  peekMypageListPageCache,
  readMypageListScroll,
  resetMypageListScrollRestoreForTests,
  saveMypageListScroll,
  writeMypageListPageCache,
} from "@/lib/mypage/mypage-list-scroll-restore";

describe("mypage-list-scroll-restore (Part A §1.4)", () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
    resetMypageListScrollRestoreForTests();
  });
  afterEach(() => {
    resetMypageListScrollRestoreForTests();
    vi.unstubAllGlobals();
  });

  it("key = pathname + sorted search (tab/filter order independent)", () => {
    expect(buildMypageListRestoreKey("/mypage/offers", "?tab=sent&filter=a")).toBe(
      buildMypageListRestoreKey("/mypage/offers/", "filter=a&tab=sent")
    );
    expect(buildMypageListRestoreKey("/mypage/offers", "?tab=sent")).not.toBe(
      buildMypageListRestoreKey("/mypage/offers", "?tab=received")
    );
    expect(buildMypageListRestoreKey("/mypage/offers", "")).toBe("/mypage/offers?");
  });

  it("TTL is 30 minutes", () => {
    expect(MYPAGE_LIST_SCROLL_TTL_MS).toBe(30 * 60_000);
    const key = buildMypageListRestoreKey("/mypage/offers", "?tab=sent");
    const t0 = 5_000_000;
    saveMypageListScroll(key, { y: 640, loadedPages: 2 }, t0);
    expect(readMypageListScroll(key, t0 + 29 * 60_000)).toEqual({ y: 640, loadedPages: 2, savedAt: t0 });
    expect(readMypageListScroll(key, t0 + 31 * 60_000)).toBeNull();
    expect(readMypageListScroll(key, t0)).toBeNull();
  });

  it("popstate pending is consumed once and only for matching key", () => {
    const a = buildMypageListRestoreKey("/mypage/offers", "");
    const b = buildMypageListRestoreKey("/mypage/reviews", "");
    noteMypageListPopstatePending(a);
    expect(consumeMypageListPopstatePending(b)).toBe(false);
    expect(consumeMypageListPopstatePending(a)).toBe(false);
    noteMypageListPopstatePending(a);
    expect(consumeMypageListPopstatePending(a)).toBe(true);
    expect(consumeMypageListPopstatePending(a)).toBe(false);
  });

  it("page cache keeps latest 10 keys for 5 minutes", () => {
    const t0 = 1_000;
    for (let i = 0; i < MYPAGE_LIST_PAGE_CACHE_MAX_ENTRIES + 2; i += 1) {
      writeMypageListPageCache(`k${i}`, [i], t0);
    }
    expect(peekMypageListPageCache("k0", t0)).toBeNull();
    expect(peekMypageListPageCache("k1", t0)).toBeNull();
    expect(peekMypageListPageCache<number[]>("k11", t0)).toEqual([11]);
    expect(peekMypageListPageCache("k11", t0 + MYPAGE_LIST_PAGE_CACHE_TTL_MS + 1)).toBeNull();
  });
});
