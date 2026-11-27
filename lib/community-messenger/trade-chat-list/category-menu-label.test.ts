import { describe, expect, it } from "vitest";
import {
  resolveTradeChatCategoryLabelForList,
  resolveTradeChatCategoryMenuFallbackKey,
  resolveTradeChatCategoryMenuLabelFallback,
} from "@/lib/community-messenger/trade-chat-list/category-menu-label";

const HANGUL = /[가-힣]/;

describe("resolveTradeChatCategoryMenuLabelFallback", () => {
  it("maps icon_key to market-style labels", () => {
    expect(resolveTradeChatCategoryMenuLabelFallback({}, { icon_key: "used-car" }, "ko")).toBe("중고차");
    expect(resolveTradeChatCategoryMenuLabelFallback({}, { icon_key: "real-estate" }, "ko")).toBe("부동산");
    expect(resolveTradeChatCategoryMenuLabelFallback({}, { icon_key: "exchange" }, "ko")).toBe("환전거래");
    expect(resolveTradeChatCategoryMenuLabelFallback({}, { icon_key: "jobs" }, "ko")).toBe("일자리");
  });

  it("uses meta heuristics when category row is missing", () => {
    expect(resolveTradeChatCategoryMenuLabelFallback({ meta: { car_model: "Civic" } }, null, "ko")).toBe("중고차");
    expect(resolveTradeChatCategoryMenuLabelFallback({ meta: { exchange_rate: 58 } }, null, "ko")).toBe("환전거래");
  });

  it("defaults to empty string", () => {
    expect(resolveTradeChatCategoryMenuLabelFallback({}, null, "ko")).toBe("");
    expect(resolveTradeChatCategoryMenuFallbackKey({}, null)).toBeNull();
  });

  it("언어 재감사 — en 결과에 한글 0", () => {
    for (const icon of ["used-car", "real-estate", "exchange", "jobs"]) {
      const label = resolveTradeChatCategoryMenuLabelFallback({}, { icon_key: icon }, "en");
      expect(label).not.toBe("");
      expect(label).not.toMatch(HANGUL);
    }
  });

  it("언어 재감사 — 받는 사람 언어를 모르면 한 언어 고정 문구를 저장하지 않는다(빈 값 → 화면 키)", () => {
    expect(resolveTradeChatCategoryLabelForList({}, { icon_key: "jobs" })).toBe("");
    expect(resolveTradeChatCategoryLabelForList({}, null)).toBe("");
    expect(resolveTradeChatCategoryLabelForList({}, { icon_key: "jobs" }, "en")).toBe("Jobs");
    /** DB 라벨(관리자 입력)은 그대로 */
    expect(resolveTradeChatCategoryLabelForList({}, { label: "생활가전" })).toBe("생활가전");
  });
});
