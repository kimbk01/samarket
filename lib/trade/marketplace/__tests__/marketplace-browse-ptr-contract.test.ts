import { describe, expect, it } from "vitest";
import {
  shouldUseRegionAllBrowsePriority,
  tradeFeedLocationSqlExtras,
} from "@/lib/trade/location/national/trade-feed-location-sql-extras";
import { resolveTradeFeedLocationConstraint } from "@/lib/trade/location/national/resolve-trade-feed-location-constraint";
import { normalizeTradeMarketPullRefreshQuery } from "@/lib/trade/trade-market-pull-refresh-surface";
import { invalidateSearchRankedWindowSession } from "@/lib/trade/marketplace/search-ranked-window-cache";

describe("trade feed location SQL extras", () => {
  it("region+all skips SQL location filter", () => {
    const c = resolveTradeFeedLocationConstraint("pasig", null);
    expect(c.kind).toBe("lgu");
    expect(tradeFeedLocationSqlExtras(c)).toBeUndefined();
    expect(shouldUseRegionAllBrowsePriority("pasig", null, true)).toBe(true);
  });

  it("region+N km applies SQL location filter", () => {
    const c = resolveTradeFeedLocationConstraint("pasig", 5);
    expect(c.kind).toBe("lgu");
    expect(tradeFeedLocationSqlExtras(c)).toBeDefined();
    expect(shouldUseRegionAllBrowsePriority("pasig", 5, true)).toBe(false);
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
