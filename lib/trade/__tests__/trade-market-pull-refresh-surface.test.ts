import { describe, expect, it } from "vitest";
import {
  buildTradeMarketPullRefreshRouteKeyFromSegment,
  isTradeMarketPullRefreshSurface,
  resolveTradeMarketPullRefreshRouteKey,
} from "@/lib/trade/trade-market-pull-refresh-surface";

describe("isTradeMarketPullRefreshSurface", () => {
  it("enables /market and category tabs", () => {
    expect(isTradeMarketPullRefreshSurface("/market")).toBe(true);
    expect(isTradeMarketPullRefreshSurface("/market/vehicle")).toBe(true);
  });

  it("excludes trade-meet-spot and non-market paths", () => {
    expect(isTradeMarketPullRefreshSurface("/market/trade-meet-spot")).toBe(false);
    expect(isTradeMarketPullRefreshSurface("/philife")).toBe(false);
    expect(isTradeMarketPullRefreshSurface("/stores")).toBe(false);
  });
});

describe("resolveTradeMarketPullRefreshRouteKey", () => {
  it("maps home and slug paths", () => {
    expect(resolveTradeMarketPullRefreshRouteKey("/market")).toBe("/market");
    expect(resolveTradeMarketPullRefreshRouteKey("/market/vehicle")).toBe("/market/vehicle");
    expect(resolveTradeMarketPullRefreshRouteKey("/market/%EC%B0%A8%EB%9F%89")).toBe("/market/차량");
  });

  it("returns null for unsupported paths", () => {
    expect(resolveTradeMarketPullRefreshRouteKey("/market/trade-meet-spot")).toBe(null);
    expect(resolveTradeMarketPullRefreshRouteKey("/market/vehicle/extra")).toBe(null);
  });
});

describe("buildTradeMarketPullRefreshRouteKeyFromSegment", () => {
  it("normalizes segment to route key", () => {
    expect(buildTradeMarketPullRefreshRouteKeyFromSegment("vehicle")).toBe("/market/vehicle");
    expect(buildTradeMarketPullRefreshRouteKeyFromSegment("")).toBe(null);
  });
});
