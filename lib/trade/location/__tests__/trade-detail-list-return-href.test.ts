import { describe, expect, it } from "vitest";
import { resolveTradeDetailListReturnHref } from "@/lib/trade/location/trade-list-return-href";

/** 지정 #9 — 거래 상세 ← 는 FIXED(목록) 유지, 채팅·찜 진입 시 오래된 목록으로 가지 않는다. */
describe("resolveTradeDetailListReturnHref", () => {
  const categoryHref = "/market/c1";

  it("previous entry is a trade list → that list (with its query)", () => {
    expect(
      resolveTradeDetailListReturnHref({ previousHref: "/market?category=c2", remembered: "/market/old", categoryHref })
    ).toBe("/market?category=c2");
    expect(
      resolveTradeDetailListReturnHref({ previousHref: "/search?q=bike", remembered: null, categoryHref })
    ).toBe("/search?q=bike");
  });

  it("entered from chat / favorites / notifications → category list, not the stale remembered list", () => {
    for (const prev of ["/community-messenger/rooms/r1", "/mypage/trade/favorites", "/notifications"]) {
      expect(resolveTradeDetailListReturnHref({ previousHref: prev, remembered: "/market/old", categoryHref })).toBe(
        categoryHref
      );
    }
  });

  it("detail → related detail keeps the remembered list", () => {
    expect(
      resolveTradeDetailListReturnHref({ previousHref: "/post/p9", remembered: "/market?category=c2", categoryHref })
    ).toBe("/market?category=c2");
  });

  it("previous entry unknown (no Navigation API / first entry) → unchanged legacy behaviour", () => {
    expect(resolveTradeDetailListReturnHref({ previousHref: null, remembered: "/market/x", categoryHref })).toBe("/market/x");
    expect(resolveTradeDetailListReturnHref({ previousHref: null, remembered: null, categoryHref })).toBe(categoryHref);
  });
});
