import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTradeBrowseRadiusKmFromSearchParams } from "@/lib/trade/location/trade-browse-radius";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("G8 검색·필터 계약", () => {
  it("TM-28: 전역 거래 검색 DB 실패는 ok:false(503) — 빈 결과로 위장하지 않음", () => {
    const src = read("lib/search/global/trade-match-only-server.ts");
    expect(src).toContain('if (!pack) return null;');
    expect(src).toContain('error: "trade_search_unavailable"');
    expect(read("app/api/search/trade/route.ts")).toContain("status: 503");
  });

  it("TM-11: 전역 검색 거래 섹션 → /market?q= 검색면 (현재 위치 파라미터 유지)", () => {
    const src = read("components/search/global/GlobalSearchView.tsx");
    expect(src).toContain("global_search_trade_more");
    expect(src).toContain("`/market?${params.toString()}`");
    expect(src).toContain("appendMarketplaceLocationSearchParams(params");
  });

  it("TM-27: 필터 시트는 닫히면 동기화 기준을 비워 다음 열기에서 URL 로 다시 맞춘다", () => {
    const src = read("components/trade/MarketFilterSheet.tsx");
    expect(src).toContain("if (!open) lastBaseRef.current = null;");
  });

  it("TM-10b: 비숫자 radius 는 거리 전체(null) — 조용한 64km 없음, 숫자는 그대로", () => {
    expect(parseTradeBrowseRadiusKmFromSearchParams(new URLSearchParams("radius=abc"), true)).toBeNull();
    expect(parseTradeBrowseRadiusKmFromSearchParams(new URLSearchParams("radius=5"), true)).toBe(5);
    expect(parseTradeBrowseRadiusKmFromSearchParams(new URLSearchParams(""), true)).toBeNull();
  });
});

describe("TM-24·TM-35 Owner 최종 방향 (2026-10-27)", () => {
  it("TM-24 → 2026-10-27 새 계약으로 대체: 검색도 나머지(band 5)까지 전체 — T5-B 게이트 없음", () => {
    const src = read("lib/posts/home-posts-query-server.ts");
    expect(src).not.toContain("shouldAllowSearchExpansionTail(");
    expect(src).toContain("rankSearchRowsBySegments");
    expect(src).toContain("searchSectionKey(5, seg)");
  });

  it("TM-24: 검색어가 있는 빈 목록은 「검색 결과가 없습니다」", () => {
    expect(read("components/home/HomeProductList.tsx")).toContain('t("global_search_empty_title")');
    expect(read("components/post/PostListByCategory.tsx")).toContain('t("global_search_empty_title")');
  });

  it("TM-35: 시트 「전체 초기화」는 시트 안 초깃값 복원만 (URL 이동 없음), ↺ 는 거래 화면 초기화(q 유지)", () => {
    const sheet = read("components/trade/MarketFilterSheet.tsx");
    expect(sheet).toContain("onClick={clearDraft}");
    expect(sheet).not.toContain("resetAllFiltersCommitted");
    const tabs = read("components/trade/TradePrimaryTabs.tsx");
    expect(tabs).toContain("buildMarketplaceBrowseResetCommittedHref");
  });
});

describe("TM-35 ↺ 는 검색어 q 를 유지한다", () => {
  it("기본 browse href 에 현재 q 를 다시 붙인다 (다른 조건은 기본값 그대로)", async () => {
    const { withPreservedMarketplaceQuery } = await import("@/lib/trade/marketplace/browse-reset-href");
    expect(withPreservedMarketplaceQuery("/market?location=all", "q=Toyota&priceMin=1000&sort=popular")).toBe(
      "/market?location=all&q=Toyota"
    );
    expect(withPreservedMarketplaceQuery("/market?location=all", "priceMin=1000")).toBe("/market?location=all");
    expect(withPreservedMarketplaceQuery("/market", "?q=a")).toBe("/market?q=a");
  });
});
