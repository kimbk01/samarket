import { describe, expect, it } from "vitest";
import {
  buildTradeSearchEntryHref,
  buildTradeSearchResultHref,
  isTradeSearchPath,
} from "@/lib/trade/search/trade-search-paths";
import { isTradeListSearchMatchSection } from "@/lib/search/global/trade-match-only-server";
import { isBottomNavEligibleRoute } from "@/lib/navigation/bottom-nav-route-policy";
import { getMobileTopTier1RuleSet } from "@/lib/layout/mobile-top-tier1-rules";
import { isTradeMarketListScrollRoute } from "@/lib/trade/location/trade-market-list-scroll-restore";

describe("거래 전용 찾기 경로 (재설계 4-1)", () => {
  it("찾기 화면 경로 판정", () => {
    expect(isTradeSearchPath("/market/search")).toBe(true);
    expect(isTradeSearchPath("/market/search?q=a")).toBe(true);
    expect(isTradeSearchPath("/market")).toBe(false);
    expect(isTradeSearchPath("/search")).toBe(false);
  });

  it("들어갈 때 목록 조건을 그대로 들고 간다(페이지 위치만 버림)", () => {
    expect(buildTradeSearchEntryHref("")).toBe("/market/search");
    expect(buildTradeSearchEntryHref("?category=car&sort=popular&q=wigo&page=3&cursor=abc")).toBe(
      "/market/search?category=car&sort=popular&q=wigo"
    );
  });

  it("찾기 → 조건 유지 + 새 검색어로 /market", () => {
    expect(buildTradeSearchResultHref("category=car&priceMax=500000&q=old", "  toyota   wigo ")).toBe(
      "/market?category=car&priceMax=500000&q=toyota+wigo"
    );
    expect(buildTradeSearchResultHref("", "iphone")).toBe("/market?q=iphone");
  });

  it("찾기 화면은 거래 목록 셸이 아니다(1단·하단 탭·목록 스크롤 복원 제외)", () => {
    expect(isBottomNavEligibleRoute("/market/search")).toBe(false);
    expect(getMobileTopTier1RuleSet("/market/search").showRegionBar).toBe(false);
    expect(isTradeMarketListScrollRoute("/market/search")).toBe(false);
    expect(isBottomNavEligibleRoute("/market")).toBe(true);
  });
});

describe("전역 검색 거래 칸 = 일치하는 글만 (재설계 4-1-4)", () => {
  it("엔진의 q:similar·q:rest 구간은 일치가 아니다", () => {
    expect(isTradeListSearchMatchSection("")).toBe(true);
    expect(isTradeListSearchMatchSection(undefined)).toBe(true);
    expect(isTradeListSearchMatchSection("state:sold")).toBe(true);
    expect(isTradeListSearchMatchSection("q:similar")).toBe(false);
    expect(isTradeListSearchMatchSection("q:rest|state:sold")).toBe(false);
  });
});
