import { describe, expect, it } from "vitest";
import { shouldShowTradeListSectionDivider } from "@/components/trade/TradeListSectionDivider";

describe("목록 안내 줄 표시 규칙 (계약 §4)", () => {
  it("첫 글: 첫 구간이면 없음, 다른 구간이면 맨 위에 안내", () => {
    expect(shouldShowTradeListSectionDivider(undefined, "", 0)).toBe(false);
    expect(shouldShowTradeListSectionDivider(undefined, "cat:other|loc:city", 0)).toBe(true);
    expect(shouldShowTradeListSectionDivider(undefined, "q:rest", 0)).toBe(true);
  });
  it("구간이 바뀌는 곳에만 안내, 키 없는 글(홍보 등)은 없음", () => {
    expect(shouldShowTradeListSectionDivider("", "", 3)).toBe(false);
    expect(shouldShowTradeListSectionDivider("", "state:sold", 3)).toBe(true);
    expect(shouldShowTradeListSectionDivider("state:sold", undefined, 4)).toBe(false);
  });
});
