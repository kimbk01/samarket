import { describe, expect, it } from "vitest";
import {
  interleavePromotedIntoOrganic,
  selectPromotedListingIds,
  tradePromotionCategoryKey,
  tradePromotionListSeed,
} from "@/lib/promotion/select-trade-promoted-listings";

describe("selectPromotedListingIds", () => {
  it("is deterministic and caps at 3", () => {
    const ids = ["d", "c", "b", "a", "e"];
    const a = selectPromotedListingIds(ids, "seed-a", 3);
    const b = selectPromotedListingIds(ids, "seed-a", 3);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
  });
});

describe("tradePromotionListSeed", () => {
  it("separates HOME 전체 from category browse", () => {
    const home = tradePromotionListSeed({ surface: "home", nowMs: 0 });
    const cat = tradePromotionListSeed({
      surface: "category",
      categoryKey: tradePromotionCategoryKey(["z", "a"]),
      nowMs: 0,
    });
    expect(home).toBe("trade:home|0");
    expect(cat).toBe("trade:category|a,z|0");
    expect(home).not.toBe(cat);
  });
});

describe("interleavePromotedIntoOrganic", () => {
  it("keeps first organic card when organic exists", () => {
    const organic = [{ id: "o1" }, { id: "o2" }, { id: "o3" }];
    const promoted = [{ id: "p1" }, { id: "p2" }];
    const out = interleavePromotedIntoOrganic(organic, promoted, "slot-seed");
    expect(out[0]?.id).toBe("o1");
    expect(out.map((x) => x.id)).toContain("p1");
    expect(out.map((x) => x.id)).toContain("p2");
    expect(new Set(out.map((x) => x.id)).size).toBe(out.length);
  });

  it("P-1: pins sit right after the first organic card, in selection order (top of page 1)", () => {
    const organic = Array.from({ length: 50 }, (_, i) => ({ id: `o${i}` }));
    const out = interleavePromotedIntoOrganic(organic, [{ id: "p1" }, { id: "p2" }, { id: "p3" }], "any-seed");
    expect(out.slice(0, 4).map((x) => x.id)).toEqual(["o0", "p1", "p2", "p3"]);
    expect(out).toHaveLength(53);
  });

  it("P-1: no organic rows → pins start at the top", () => {
    expect(interleavePromotedIntoOrganic([], [{ id: "p1" }], "s").map((x) => x.id)).toEqual(["p1"]);
  });
});
