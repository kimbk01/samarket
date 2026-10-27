import { describe, expect, it } from "vitest";
import {
  decodeTradeListCursor,
  resolveShownTradeListPageCursor,
  type TradeListPageRow,
} from "@/lib/trade/marketplace/list-contract/trade-list-page.server";

/** 거래 C L-2 — 다음 페이지 기준 = 실제로 보여 준 마지막 일반 글 */
function rows(n: number): TradeListPageRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    list_section: "",
    sort_key: [0, 0, 0, 0, 0, 0, i, 0, `p${i}`],
  }));
}

describe("resolveShownTradeListPageCursor", () => {
  it("홍보 글이 끼어 일반 글 뒤쪽이 잘리면 마지막으로 보여 준 일반 글 키로 이어 읽는다", () => {
    const ranked = rows(50);
    const shown = [{ id: "promo1" }, ...ranked.slice(0, 47).map((r) => ({ id: r.id })), { id: "promo2" }, { id: "promo3" }];
    const out = resolveShownTradeListPageCursor({
      rows: ranked,
      shownPosts: shown,
      promotedIdsOnPage: ["promo1", "promo2", "promo3"],
      ranked: { hasMore: false, nextCursor: null },
    });
    expect(out.hasMore).toBe(true);
    expect(decodeTradeListCursor(out.nextCursor)).toEqual(ranked[46]!.sort_key);
  });

  it("잘린 글이 없으면 순위 결과 그대로", () => {
    const ranked = rows(50);
    const ranked50 = { hasMore: true, nextCursor: "abc" };
    const out = resolveShownTradeListPageCursor({
      rows: ranked,
      shownPosts: ranked.map((r) => ({ id: r.id })),
      promotedIdsOnPage: [],
      ranked: ranked50,
    });
    expect(out).toEqual(ranked50);
  });

  it("홍보로 표시된 글은 일반 글 기준에서 뺀다", () => {
    const ranked = rows(5);
    const out = resolveShownTradeListPageCursor({
      rows: ranked,
      shownPosts: [{ id: "p0" }, { id: "p1" }, { id: "p4" }],
      promotedIdsOnPage: ["p4"],
      ranked: { hasMore: false, nextCursor: null },
    });
    expect(out.hasMore).toBe(true);
    expect(decodeTradeListCursor(out.nextCursor)).toEqual(ranked[1]!.sort_key);
  });
});
