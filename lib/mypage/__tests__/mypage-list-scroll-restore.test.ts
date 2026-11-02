import { afterEach, describe, expect, it } from "vitest";
import {
  MYPAGE_LIST_PAGE_CACHE_MAX_ENTRIES,
  MYPAGE_LIST_PAGE_CACHE_TTL_MS,
  peekMypageListPageCache,
  resetMypageListScrollRestoreForTests,
  writeMypageListPageCache,
} from "@/lib/mypage/mypage-list-scroll-restore";

describe("mypage-list-scroll-restore — 불러온 페이지 캐시만 (스크롤은 app-scroll-memory 하나)", () => {
  afterEach(() => {
    resetMypageListScrollRestoreForTests();
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
