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

  it("HOME search stays on /market and sell hub uses existing WRITE", () => {
    const chrome = read("components/trade/MarketplaceHomeEntryChrome.tsx");
    expect(chrome).not.toContain('href="/search"');
    expect(chrome).toContain("openTradeWriteSheet");
    expect(chrome).toContain("marketplace_sell_hub_create");
    expect(chrome).toContain("marketplace_search_placeholder");
    expect(chrome).toContain("sanitizeMarketplaceQueryText");
    const sticky = read("components/layout/AppStickyHeader.tsx");
    expect(sticky).toContain("MarketplaceHomeEntryChrome");
    const home = read("components/home/HomeProductList.tsx");
    expect(home).toContain("q,");
  });

  it("topic row is 전체 + 더보기 categories + 지역, no 최신순", () => {
    const tabs = read("components/trade/TradePrimaryTabs.tsx");
    expect(tabs).not.toContain("allSortChip");
    expect(tabs).not.toContain("leading=");
    expect(tabs).toContain("marketplace_more_categories");
    expect(tabs).toContain("marketplace_region_chip");
    expect(tabs).toContain("TRADE_BROWSE_LOCATION_PATH");
  });

  it("search and write back fallback to Marketplace HOME", () => {
    expect(resolveMainTier1Subpage("/search")?.backHref).toBe("/market");
    expect(resolveMainTier1Subpage("/write")?.backHref).toBe("/market");
  });

  it("preserves q when switching category href", () => {
    expect(
      buildTradeMarketFeedHref({
        categoryId: "used-car",
        baseSearch: "q=Toyota&lgu=pasig",
      })
    ).toBe("/market?q=Toyota&lgu=pasig&category=used-car");
  });

  it("전체 href drops q so default Marketplace feed is unscoped search", () => {
    expect(buildTradeMarketFeedHref({ baseSearch: "q=Toyota&lgu=pasig" })).toBe(
      "/market?lgu=pasig"
    );
  });
});
