import { describe, expect, it } from "vitest";
import {
  adminPaginationPageCount,
  adminPaginationRange,
  adminPaginationSummary,
  adminPaginationWindow,
} from "@/lib/admin/pagination/admin-pagination-window";

describe("adminPaginationWindow (최대 7칸)", () => {
  it("7쪽 이하면 전부", () => {
    expect(adminPaginationWindow(1, 1)).toEqual([1]);
    expect(adminPaginationWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("앞쪽", () => {
    expect(adminPaginationWindow(1, 20)).toEqual([1, 2, 3, 4, 5, "ellipsis-end", 20]);
    expect(adminPaginationWindow(4, 20)).toEqual([1, 2, 3, 4, 5, "ellipsis-end", 20]);
  });

  it("가운데", () => {
    expect(adminPaginationWindow(5, 20)).toEqual([1, "ellipsis-start", 4, 5, 6, "ellipsis-end", 20]);
    expect(adminPaginationWindow(10, 20)).toEqual([1, "ellipsis-start", 9, 10, 11, "ellipsis-end", 20]);
  });

  it("뒤쪽", () => {
    expect(adminPaginationWindow(16, 20)).toEqual([1, "ellipsis-start", 15, 16, 17, "ellipsis-end", 20]);
    expect(adminPaginationWindow(17, 20)).toEqual([1, "ellipsis-start", 16, 17, 18, 19, 20]);
    expect(adminPaginationWindow(18, 20)).toEqual([1, "ellipsis-start", 16, 17, 18, 19, 20]);
    expect(adminPaginationWindow(20, 20)).toEqual([1, "ellipsis-start", 16, 17, 18, 19, 20]);
  });

  it("범위 밖 page 는 고정", () => {
    expect(adminPaginationWindow(0, 20)).toEqual(adminPaginationWindow(1, 20));
    expect(adminPaginationWindow(99, 20)).toEqual(adminPaginationWindow(20, 20));
  });

  it("모든 경우 7칸 이하 · 현재 쪽 포함 · 첫/끝 포함 · 오름차순", () => {
    for (let count = 1; count <= 30; count++) {
      for (let page = 1; page <= count; page++) {
        const w = adminPaginationWindow(page, count);
        expect(w.length).toBeLessThanOrEqual(7);
        expect(w).toContain(page);
        expect(w[0]).toBe(1);
        expect(w[w.length - 1]).toBe(count);
        const nums = w.filter((x): x is number => typeof x === "number");
        expect([...nums].sort((a, b) => a - b)).toEqual(nums);
        // 생략 기호는 실제로 1쪽 이상을 건너뛸 때만
        w.forEach((x, i) => {
          if (typeof x === "string") expect((w[i + 1] as number) - (w[i - 1] as number)).toBeGreaterThan(1);
        });
      }
    }
  });
});

describe("summary", () => {
  it("「전체 1,234건 중 1–50」", () => {
    expect(adminPaginationSummary(1, 50, 1234, true)).toBe("전체 1,234건 중 1–50");
    expect(adminPaginationSummary(25, 50, 1234, true)).toBe("전체 1,234건 중 1,201–1,234");
    expect(adminPaginationSummary(2, 20, 45, false)).toBe("21–40 of 45");
  });

  it("0건", () => {
    expect(adminPaginationSummary(1, 20, 0, true)).toBe("전체 0건");
    expect(adminPaginationRange(1, 20, 0)).toEqual({ start: 0, end: 0 });
    expect(adminPaginationPageCount(0, 20)).toBe(1);
  });
});
