import { describe, expect, it } from "vitest";
import { shouldShowTradeListSectionDivider } from "@/components/trade/TradeListSectionDivider";

describe("목록 안내 줄 표시 규칙 (계약 §4, Owner 2026-10-27: 지역 구분 줄 없음)", () => {
  it("첫 글: 첫 구간·지역 구간이면 없음, 다른 조건 구간이면 맨 위에 안내", () => {
    expect(shouldShowTradeListSectionDivider(undefined, "", 0)).toBe(false);
    expect(shouldShowTradeListSectionDivider(undefined, "loc:city", 0)).toBe(false);
    expect(shouldShowTradeListSectionDivider(undefined, "cat:other|loc:city", 0)).toBe(true);
    expect(shouldShowTradeListSectionDivider(undefined, "q:rest", 0)).toBe(true);
  });
  it("지역만 바뀌면 줄 없음, 조건이 바뀌면 줄", () => {
    expect(shouldShowTradeListSectionDivider("", "loc:nearby", 3)).toBe(false);
    expect(shouldShowTradeListSectionDivider("loc:city", "loc:outside", 4)).toBe(false);
    expect(shouldShowTradeListSectionDivider("loc:outside", "state:sold", 5)).toBe(true);
    expect(shouldShowTradeListSectionDivider("state:sold", "state:sold|loc:nearby", 6)).toBe(false);
    expect(shouldShowTradeListSectionDivider("state:sold", undefined, 7)).toBe(false);
  });
});
