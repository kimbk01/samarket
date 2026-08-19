import { describe, expect, it } from "vitest";
import {
  buildTradeMarketPullRefreshRouteKeyFromSegment,
  isTradeMarketPullRefreshSurface,
  normalizeTradeMarketPullRefreshQuery,
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

describe("normalizeTradeMarketPullRefreshQuery", () => {
  it("keeps committed browse params except page and cursor", () => {
    expect(
      normalizeTradeMarketPullRefreshQuery(
        "topic=phones&fs=popular&location=city&lgu=quezon&page=2&cursor=x"
      )
    ).toBe("fs=popular&lgu=quezon&location=city&topic=phones");
    expect(normalizeTradeMarketPullRefreshQuery("topic=phones&fs=popular&noise=1")).toBe(
      "fs=popular&noise=1&topic=phones"
    );
  });
});

describe("resolveTradeMarketPullRefreshRouteKey", () => {
  it("maps home and slug paths", () => {
    expect(resolveTradeMarketPullRefreshRouteKey("/market")).toBe("/market");
    expect(resolveTradeMarketPullRefreshRouteKey("/market/vehicle")).toBe("/market/vehicle");
    expect(resolveTradeMarketPullRefreshRouteKey("/market/%EC%B0%A8%EB%9F%89")).toBe("/market/차량");
  });

  it("includes topic query for per-feed PTR handlers", () => {
    expect(
      resolveTradeMarketPullRefreshRouteKey("/market/abc-uuid", new URLSearchParams({ topic: "phones" }))
    ).toBe("/market/abc-uuid?topic=phones");
    expect(
      resolveTradeMarketPullRefreshRouteKey("/market", new URLSearchParams({ tradeState: "active" }))
    ).toBe("/market?tradeState=active");
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
