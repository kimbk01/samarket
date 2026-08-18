import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMainTier1Subpage } from "@/lib/layout/resolve-main-tier1";
import { isTradeMarketAllRouteActive } from "@/lib/categories/tradeMarketPath";
import { buildTradeMarketFeedHref } from "@/lib/trade/tabs/trade-market-feed-href";
import { tradeMessages } from "@/lib/i18n/catalog/trade";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("Marketplace UI-1 HOME chrome", () => {
  it("canonical all-feed is existing /market with no category", () => {
    expect(buildTradeMarketFeedHref()).toBe("/market");
    expect(isTradeMarketAllRouteActive("/market", "")).toBe(true);
    expect(isTradeMarketAllRouteActive("/market", "used-car")).toBe(false);
  });

  it("HOME header uses Marketplace identity, not bottom-nav 거래 title", () => {
    expect(tradeMessages.ko.marketplace_home_title).toBe("Marketplace");
    expect(tradeMessages.en.marketplace_home_title).toBe("Marketplace");
    const header = read("components/layout/RegionBarMainHubTier1.tsx");
    expect(header).toContain('t("marketplace_home_title")');
    expect(header).not.toContain("TradeHeaderLocationPinButton");
  });

  it("HOME search and sell entry are visible and use existing routes", () => {
    const chrome = read("components/trade/MarketplaceHomeEntryChrome.tsx");
    expect(chrome).toContain('href="/search"');
    expect(chrome).toContain("openTradeWriteSheet");
    expect(chrome).toContain("trade_write_sell_cta");
    expect(chrome).toContain("marketplace_search_placeholder");
    const sticky = read("components/layout/AppStickyHeader.tsx");
    expect(sticky).toContain("MarketplaceHomeEntryChrome");
  });

  it("topic row is topics only — 전체 first, no 최신순 sort chip", () => {
    const tabs = read("components/trade/TradePrimaryTabs.tsx");
    expect(tabs).not.toContain("allSortChip");
    expect(tabs).not.toContain("leading=");
    expect(tabs).toContain("displayTabs.map");
    expect(tabs).not.toContain('filter((tab) => tab.key !== "all")');
  });

  it("search and write back fallback to Marketplace HOME", () => {
    expect(resolveMainTier1Subpage("/search")?.backHref).toBe("/market");
    expect(resolveMainTier1Subpage("/write")?.backHref).toBe("/market");
  });
});
