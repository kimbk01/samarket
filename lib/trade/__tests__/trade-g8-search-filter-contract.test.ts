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
