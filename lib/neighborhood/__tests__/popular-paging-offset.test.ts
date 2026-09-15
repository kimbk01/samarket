import { describe, expect, it } from "vitest";
import { resolvePopularPagingOffsetAdvance } from "@/lib/neighborhood/popular-paging-offset";

/**
 * Simulates two popular pages with pageSize+1 probe windows.
 * Advance must exclude the probe so page2 does not skip/duplicate the boundary row.
 */
function simulatePopularPages(allIds: string[], pageSize: number) {
  let offset = 0;
  const pages: string[][] = [];
  for (let p = 0; p < 2; p++) {
    const window = allIds.slice(offset, offset + pageSize + 1);
    const hasMore = window.length > pageSize;
    const page = hasMore ? window.slice(0, pageSize) : window;
    pages.push(page);
    offset += resolvePopularPagingOffsetAdvance({
      hasMore,
      pageSize,
      dbScannedCount: window.length,
    });
  }
  return pages;
}

describe("popular paging offset advance — page boundary", () => {
  it("page1/page2: duplicate=0 and missing=0 at boundary", () => {
    const pageSize = 5;
    const allIds = Array.from({ length: 20 }, (_, i) => `post-${i + 1}`);
    const [page1, page2] = simulatePopularPages(allIds, pageSize);

    expect(page1).toEqual(["post-1", "post-2", "post-3", "post-4", "post-5"]);
    expect(page2).toEqual(["post-6", "post-7", "post-8", "post-9", "post-10"]);

    const set1 = new Set(page1);
    const set2 = new Set(page2);
    const duplicates = page1.filter((id) => set2.has(id));
    expect(duplicates).toEqual([]);

    const expectedBoundary = allIds.slice(0, pageSize * 2);
    const seen = new Set([...page1, ...page2]);
    const missing = expectedBoundary.filter((id) => !seen.has(id));
    expect(missing).toEqual([]);
  });

  it("when hasMore, advance equals pageSize not dbScannedCount", () => {
    expect(
      resolvePopularPagingOffsetAdvance({ hasMore: true, pageSize: 20, dbScannedCount: 21 })
    ).toBe(20);
    expect(
      resolvePopularPagingOffsetAdvance({ hasMore: false, pageSize: 20, dbScannedCount: 7 })
    ).toBe(7);
  });
});
