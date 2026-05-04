import { describe, expect, it } from "vitest";
import { resolveTradeChatCategoryMenuLabelFallback } from "@/lib/community-messenger/trade-chat-list/category-menu-label";

describe("resolveTradeChatCategoryMenuLabelFallback", () => {
  it("maps icon_key to market-style labels", () => {
    expect(resolveTradeChatCategoryMenuLabelFallback({}, { icon_key: "used-car" })).toBe("중고차");
    expect(resolveTradeChatCategoryMenuLabelFallback({}, { icon_key: "real-estate" })).toBe("부동산");
    expect(resolveTradeChatCategoryMenuLabelFallback({}, { icon_key: "exchange" })).toBe("환전거래");
    expect(resolveTradeChatCategoryMenuLabelFallback({}, { icon_key: "jobs" })).toBe("일자리");
  });

  it("uses meta heuristics when category row is missing", () => {
    expect(resolveTradeChatCategoryMenuLabelFallback({ meta: { car_model: "Civic" } }, null)).toBe("중고차");
    expect(resolveTradeChatCategoryMenuLabelFallback({ meta: { exchange_rate: 58 } }, null)).toBe("환전거래");
  });

  it("defaults to empty string", () => {
    expect(resolveTradeChatCategoryMenuLabelFallback({}, null)).toBe("");
  });
});
