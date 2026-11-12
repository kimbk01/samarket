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

  it("거래·커뮤니티 1단 = 제목 글자, 「정보교환 · 거래」 전환 탭 = 머리글 3단 오른쪽 정렬 (Owner 「A 안」 2026-11-12)", () => {
    expect(tradeMessages.ko.marketplace_home_title).toBe("DIBAY MARKET");
    const header = read("components/layout/RegionBarMainHubTier1.tsx");
    expect(header).not.toContain("CommunityTradeTitleSwitch");
    expect(header).toContain('"nav_community_switch_info"');
    expect(header).toContain('"nav_bottom_trade"');
    expect(header).not.toContain('t("marketplace_home_title")');
    expect(header).not.toContain("TradeHeaderLocationPinButton");
    const sticky = read("components/layout/AppStickyHeader.tsx");
    expect(sticky).toContain('<CommunityTradeSwitchRow active="trade" />');
    expect(sticky.indexOf("<TradePrimaryTabs")).toBeLessThan(sticky.indexOf("<CommunityTradeSwitchRow"));
    const feed = read("components/community/CommunityFeed.tsx");
    expect(feed).toContain('<CommunityTradeSwitchRow active="community" />');
    expect(feed.indexOf("</DibaySecondaryTabRow>")).toBeLessThan(feed.indexOf("<CommunityTradeSwitchRow"));
    const sw = read("components/layout/CommunityTradeTitleSwitch.tsx");
    /** 3단 전환 탭 = 오른쪽 정렬, 2단 탭 = 왼쪽 정렬 (Owner 2026-11-12) */
    expect(sw).toContain("justify-end");
    expect(sw).not.toContain("justify-start");
    expect(sw).not.toMatch(/truncate|text-ellipsis/);
    /** 2단 탭 왼쪽 정렬 — 거래(4개 탭)·커뮤니티 모두 균등 분할 해제 */
    expect(read("components/trade/TradePrimaryTabs.tsx")).toContain('data-dibay-tab-align="start"');
    expect(feed).toContain('data-dibay-tab-align="start"');
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
    /** 상단 시안 v2 (Owner 2026-10-28): 한 줄 `판매·둘러보기·지역·카테고리 | 📍·필터` — 위치 이름·↺ 는 이 줄에 없음 */
    expect(tabs).toContain('<TradeHeaderLocationPinButton placement="icon-only" />');
    expect(tabs).not.toContain("data-marketplace-browse-reset");
    /** Owner 2026-10-28: 헤더 3단(조건 칩 줄) 없음 — 조건은 필터 시트 「적용된 조건」에서만 */
    expect(tabs).not.toContain("data-marketplace-condition-chips");
    expect(tabs).not.toContain("data-marketplace-topic-chip");
    expect(tabs).not.toContain("data-marketplace-search-chip");
    expect(tabs).toContain("countMarketAppliedConditions");
    const sheet = read("components/trade/MarketFilterSheet.tsx");
    expect(sheet).toContain("data-marketplace-applied-conditions");
    expect(sheet).toContain("removeMarketCondition(baseSearch, c.key)");
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
