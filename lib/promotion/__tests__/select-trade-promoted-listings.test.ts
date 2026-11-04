import { describe, expect, it } from "vitest";
import {
  interleavePromotedIntoOrganic,
  selectPromotedListingIds,
} from "@/lib/promotion/select-trade-promoted-listings";

describe("selectPromotedListingIds", () => {
  it("재감사 R2: 넘긴 순서(최근 결제 순) 앞에서 3개 — 회전·정렬 없음", () => {
    expect(selectPromotedListingIds(["c", "b", "a", "d"], 3)).toEqual(["c", "b", "a"]);
    expect(selectPromotedListingIds(["c", "c", " b ", ""], 3)).toEqual(["c", "b"]);
    expect(selectPromotedListingIds(["c"], 0)).toEqual([]);
  });

  it("Owner 2026-11-05 「1건」: 기본값은 가장 최근 결제 1개", () => {
    expect(selectPromotedListingIds(["c", "b", "a"])).toEqual(["c"]);
  });
});

describe("interleavePromotedIntoOrganic", () => {
  it("keeps first organic card when organic exists", () => {
    const organic = [{ id: "o1" }, { id: "o2" }, { id: "o3" }];
    const promoted = [{ id: "p1" }, { id: "p2" }];
    const out = interleavePromotedIntoOrganic(organic, promoted);
    expect(out[0]?.id).toBe("o1");
    expect(out.map((x) => x.id)).toContain("p1");
    expect(out.map((x) => x.id)).toContain("p2");
    expect(new Set(out.map((x) => x.id)).size).toBe(out.length);
  });

  it("P-1: pins sit right after the first organic card, in selection order (top of page 1)", () => {
    const organic = Array.from({ length: 50 }, (_, i) => ({ id: `o${i}` }));
    const out = interleavePromotedIntoOrganic(organic, [{ id: "p1" }, { id: "p2" }, { id: "p3" }]);
    expect(out.slice(0, 4).map((x) => x.id)).toEqual(["o0", "p1", "p2", "p3"]);
    expect(out).toHaveLength(53);
  });

  it("P-1: no organic rows → pins start at the top", () => {
    expect(interleavePromotedIntoOrganic([], [{ id: "p1" }]).map((x) => x.id)).toEqual(["p1"]);
  });
});
