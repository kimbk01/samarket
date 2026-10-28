import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  countMarketAppliedConditions,
  listMarketAppliedConditions,
  removeMarketCondition,
} from "@/lib/trade/marketplace/market-applied-conditions";

/** Owner 2026-10-28 승인 — 3단 없음 · 필터 안 적용 조건 · ✕ 즉시 해제 · 목록 계약 순위 */
describe("market applied conditions SSOT", () => {
  const search =
    "location=city&lgu=pasig&radius=20&sort=popular&tradeState=active&priceMin=1000&filters[car_trade]=sell&filters[make]=toyota&category=cat-car&q=iphone";

  it("목록 계약 순위 순(①검색어 ②물품 ③옵션·가격 ④거래 상태 ⑥정렬), 위치·반경은 세지 않는다", () => {
    const list = listMarketAppliedConditions(search);
    expect(list.map((c) => c.key)).toEqual([
      "q",
      "category",
      "option:car_trade",
      "option:make",
      "price",
      "tradeState",
      "sort",
    ]);
    expect(list.map((c) => c.rank)).toEqual([1, 2, 3, 3, 3, 4, 6]);
    expect(countMarketAppliedConditions(search)).toBe(7);
    expect(countMarketAppliedConditions("location=city&lgu=pasig&radius=20")).toBe(0);
  });

  it("물품을 빼면 그 물품의 품목 옵션도 함께 빠진다(숨은 조건 없음)", () => {
    const next = new URLSearchParams(removeMarketCondition(search, "category"));
    expect(next.get("category")).toBeNull();
    expect([...next.keys()].some((k) => k.startsWith("filters["))).toBe(false);
    expect(next.get("q")).toBe("iphone");
    expect(next.get("radius")).toBe("20");
  });

  it("옵션·가격·상태·정렬·검색어는 그 조건만 빠진다", () => {
    expect(new URLSearchParams(removeMarketCondition(search, "option:make")).get("filters[make]")).toBeNull();
    expect(new URLSearchParams(removeMarketCondition(search, "option:make")).get("filters[car_trade]")).toBe("sell");
    expect(new URLSearchParams(removeMarketCondition(search, "price")).get("priceMin")).toBeNull();
    expect(new URLSearchParams(removeMarketCondition(search, "tradeState")).get("tradeState")).toBeNull();
    expect(new URLSearchParams(removeMarketCondition(search, "sort")).get("sort")).toBeNull();
    const noQ = new URLSearchParams(removeMarketCondition(search, "q"));
    expect(noQ.get("q")).toBeNull();
    expect(noQ.get("category")).toBe("cat-car");
  });

  it("거래 탭 줄에는 조건 칩 줄이 없고, 필터 시트가 같은 SSOT 로 보이고 뺀다", () => {
    const root = path.resolve(__dirname, "../../../..");
    const tabs = readFileSync(path.join(root, "components/trade/TradePrimaryTabs.tsx"), "utf8");
    const sheet = readFileSync(path.join(root, "components/trade/MarketFilterSheet.tsx"), "utf8");
    expect(tabs).not.toContain("data-marketplace-condition-chips");
    expect(sheet).toContain("listMarketAppliedConditions(baseSearch)");
    expect(sheet).toContain("countMarketAppliedConditions(baseSearch)");
  });
});
