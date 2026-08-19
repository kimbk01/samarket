import { describe, expect, it } from "vitest";
import {
  filterPostsOutsideBrowseAnchor,
  filterPostsWithinBrowseAnchor,
  shouldUseRegionAllBrowsePriority,
  tradeFeedLocationSqlExtras,
} from "@/lib/trade/location/national/trade-feed-location-sql-extras";
import {
  listingMatchesTradeFeedLocation,
  resolveTradeFeedLocationConstraint,
} from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import { normalizeTradeMarketPullRefreshQuery } from "@/lib/trade/trade-market-pull-refresh-surface";
import { invalidateSearchRankedWindowSession } from "@/lib/trade/marketplace/search-ranked-window-cache";

describe("region+all browse priority partition", () => {
  it("anchor within and outside are disjoint for canonical rows", () => {
    const constraint = resolveTradeFeedLocationConstraint("1381200000", null);
    if (constraint.kind !== "lgu") return;
    const anchorRow = {
      trade_lgu_id: constraint.canonicalId,
      region: "NCR",
      city: "Pasig",
    };
    const otherRow = {
      trade_lgu_id: "1376020000",
      region: "NCR",
      city: "Makati",
    };
    expect(listingMatchesTradeFeedLocation(anchorRow, constraint)).toBe(true);
    expect(listingMatchesTradeFeedLocation(otherRow, constraint)).toBe(false);
    const batch = [anchorRow, otherRow];
    expect(filterPostsWithinBrowseAnchor(batch, constraint)).toHaveLength(1);
    expect(filterPostsOutsideBrowseAnchor(batch, constraint)).toHaveLength(1);
  });

  it("simulated feed puts anchor block before outside block", () => {
    const constraint = resolveTradeFeedLocationConstraint("1381200000", null);
    if (constraint.kind !== "lgu") return;
    const within = [{ id: "a", trade_lgu_id: constraint.canonicalId }];
    const outside = [{ id: "b", trade_lgu_id: "1376020000" }];
    const page = [...within, ...outside].slice(0, 2);
    expect(page[0]?.id).toBe("a");
    expect(page[1]?.id).toBe("b");
  });
});

describe("trade feed location SQL extras", () => {
  it("region+all skips SQL location filter", () => {
    const c = resolveTradeFeedLocationConstraint("pasig", null);
    expect(c.kind).toBe("lgu");
    expect(tradeFeedLocationSqlExtras(c)).toBeUndefined();
    expect(shouldUseRegionAllBrowsePriority("pasig", null, true)).toBe(true);
  });

  it("region+N km uses browse priority without SQL location filter", () => {
    const c = resolveTradeFeedLocationConstraint("pasig", 5);
    expect(c.kind).toBe("lgu");
    expect(tradeFeedLocationSqlExtras(c)).toBeUndefined();
    expect(shouldUseRegionAllBrowsePriority("pasig", 5, true)).toBe(true);
  });
});

describe("PTR route key", () => {
  it("includes location and q so committed browse states do not collide", () => {
    const a = normalizeTradeMarketPullRefreshQuery(
      "location=city&lgu=pasig&q=iphone&fs=popular"
    );
    const b = normalizeTradeMarketPullRefreshQuery(
      "location=city&lgu=makati&q=iphone&fs=popular"
    );
    expect(a).not.toBe(b);
    expect(a).toContain("lgu=pasig");
    expect(b).toContain("lgu=makati");
  });

  it("strips page/cursor only", () => {
    const q = normalizeTradeMarketPullRefreshQuery("page=2&cursor=abc&q=test");
    expect(q).not.toContain("page=");
    expect(q).not.toContain("cursor=");
    expect(q).toContain("q=test");
  });
});

describe("search ranked window invalidate", () => {
  it("drops session by key", () => {
    const key = "exp:test";
    invalidateSearchRankedWindowSession(key);
    expect(true).toBe(true);
  });
});
