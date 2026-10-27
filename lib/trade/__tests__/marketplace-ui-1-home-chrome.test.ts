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
    expect(tradeMessages.ko.marketplace_home_title).toBe("DIBAY MARKET");
    expect(tradeMessages.en.marketplace_home_title).toBe("DIBAY MARKET");
    const header = read("components/layout/RegionBarMainHubTier1.tsx");
    expect(header).toContain('t("marketplace_home_title")');
    expect(header).not.toContain("TradeHeaderLocationPinButton");
  });

  it("HOME magnifier opens trade-only search (재설계 4-1); in-page /market?q= loader remains", () => {
    const chrome = read("components/trade/MarketplaceHomeEntryChrome.tsx");
    expect(chrome).not.toContain("TradeHeaderLocationPinButton");
    const header = read("components/layout/RegionBarMainHubTier1.tsx");
    expect(header).toContain("openGlobalSearchFromHere");
    expect(header).toContain("buildTradeSearchEntryHref");
    expect(header).toContain("data-trade-search-open");
    expect(header).not.toContain("sanitizeMarketplaceQueryText");
    const tabs = read("components/trade/TradePrimaryTabs.tsx");
    expect(tabs).not.toContain("data-marketplace-sell-cta");
    /** 거래 E (Owner 2026-10-28 「판매 하기부분을 넣으면 안되는 부분」): 헤더에 판매 CTA 없음 — 판매는 탭 줄 「판매」 탭 */
    expect(header).not.toContain('"/market/sell"');
    expect(header).not.toContain("data-marketplace-sell-cta");
    expect(tabs).toContain('data-marketplace-tab="sell"');
    const sticky = read("components/layout/AppStickyHeader.tsx");
    expect(sticky).toContain("MarketplaceHomeEntryChrome");
    const home = read("components/home/HomeProductList.tsx");
    expect(home).toContain("q,");
  });

  it("topic row is 전체 + 필터, no 최신순", () => {
    const tabs = read("components/trade/TradePrimaryTabs.tsx");
    expect(tabs).not.toContain("allSortChip");
    expect(tabs).toContain("marketplace_filter_button");
    expect(tabs).toContain("data-marketplace-filter");
    expect(tabs).toContain("MarketFilterSheet");
  });

  it("search close fallback is Community home; write still returns to Marketplace HOME", () => {
    expect(resolveMainTier1Subpage("/search")?.backHref).toBe("/philife");
    expect(resolveMainTier1Subpage("/write")?.backHref).toBe("/market");
  });

  it("sell hub excludes marketplace browse tab row chrome; tab row = 판매·둘러보기·지역·카테고리 | 📍", () => {
    const sticky = read("components/layout/AppStickyHeader.tsx");
    expect(sticky).toContain('pathNoQueryForSurface !== "/market/sell"');
    const tabs = read("components/trade/TradePrimaryTabs.tsx");
    expect(tabs).toContain('leading={<TradeHeaderLocationPinButton placement="below-title" />}');
    /** 거래 E: 「판매」 탭만 판매 허브로 간다 */
    expect(tabs).toContain('const href = "/market/sell";');
    for (const key of ["sell", "browse", "nearby", "categories"]) {
      expect(tabs).toContain(`data-marketplace-tab="${key}"`);
    }
    expect(tabs).toContain('next.set("sort", "near")');
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
