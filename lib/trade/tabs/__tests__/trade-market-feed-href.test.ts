import { describe, expect, it } from "vitest";
import {
  buildTradeMarketFeedHref,
  isTradeMarketHubPathname,
  parseTradeMarketCategoryFromSearch,
} from "@/lib/trade/tabs/trade-market-feed-href";
import {
  isTradeMarketAllRouteActive,
  isTradeMarketRouteActive,
} from "@/lib/categories/tradeMarketPath";

describe("trade-market-feed-href (community parity)", () => {
  it("builds /market for all and query category for tabs", () => {
    expect(buildTradeMarketFeedHref()).toBe("/market");
    expect(buildTradeMarketFeedHref({ categoryId: "cat-1" })).toBe("/market?category=cat-1");
    expect(
      buildTradeMarketFeedHref({ categoryId: "cat-1", tradeState: "active", topic: "phones" })
    ).toBe("/market?category=cat-1&tradeState=active&topic=phones");
  });

  it("parses category from search", () => {
    expect(parseTradeMarketCategoryFromSearch(new URLSearchParams("category=abc"))).toBe("abc");
    expect(parseTradeMarketCategoryFromSearch(new URLSearchParams("categoryIds=xyz"))).toBe("xyz");
    expect(parseTradeMarketCategoryFromSearch(new URLSearchParams())).toBe("");
  });

  it("recognizes market hub pathnames", () => {
    expect(isTradeMarketHubPathname("/market")).toBe(true);
    expect(isTradeMarketHubPathname("/market/uuid")).toBe(true);
    expect(isTradeMarketHubPathname("/market/location")).toBe(false);
    expect(isTradeMarketHubPathname("/philife")).toBe(false);
  });

  it("activates all vs category on query surface", () => {
    expect(isTradeMarketAllRouteActive("/market", "")).toBe(true);
    expect(isTradeMarketAllRouteActive("/market", "cat-1")).toBe(false);
    expect(
      isTradeMarketRouteActive("/market", { id: "cat-1", slug: "used" }, "cat-1")
    ).toBe(true);
    expect(
      isTradeMarketRouteActive("/market", { id: "cat-2", slug: "jobs" }, "cat-1")
    ).toBe(false);
    expect(
      isTradeMarketRouteActive("/market/cat-1", { id: "cat-1", slug: "" }, null)
    ).toBe(true);
  });
});
