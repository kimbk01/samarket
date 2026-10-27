import { describe, expect, it } from "vitest";
import {
  maskTradeDetailBuyerFields,
  stripTradeListPrivateFields,
} from "@/lib/posts/public-post-private-fields";

describe("stripTradeListPrivateFields — 목록 응답 (TM-02·TM-29)", () => {
  it("구매자 id 를 비우고 거래장소 좌표·place_id 를 뺀다 (표시 문구는 유지)", () => {
    const out = stripTradeListPrivateFields({
      id: "p1",
      reserved_buyer_id: "buyer-r",
      sold_buyer_id: "buyer-s",
      meta: {
        direct_deal: true,
        trade_meet_spot: { display_line: "SM Mall", lat: 14.5, lng: 121.0, place_id: "g1", app_city_id: "c1" },
      },
    });
    expect(out.reserved_buyer_id).toBeNull();
    expect(out.sold_buyer_id).toBeNull();
    expect(out.meta).toEqual({
      direct_deal: true,
      trade_meet_spot: { display_line: "SM Mall", app_city_id: "c1" },
    });
  });

  it("해당 키가 없으면 새로 만들지 않는다", () => {
    const out = stripTradeListPrivateFields({ id: "p1", meta: { a: 1 } });
    expect("sold_buyer_id" in out).toBe(false);
    expect(out.meta).toEqual({ a: 1 });
  });
});

describe("maskTradeDetailBuyerFields — 상세 응답", () => {
  const row = { user_id: "seller", reserved_buyer_id: "buyer-r", sold_buyer_id: "buyer-s" };

  it("비로그인·제3자에게는 둘 다 숨긴다", () => {
    expect(maskTradeDetailBuyerFields(row, null)).toMatchObject({ reserved_buyer_id: null, sold_buyer_id: null });
    expect(maskTradeDetailBuyerFields(row, "other")).toMatchObject({ reserved_buyer_id: null, sold_buyer_id: null });
  });

  it("판매자에게는 둘 다 보인다", () => {
    expect(maskTradeDetailBuyerFields(row, "seller")).toMatchObject(row);
  });

  it("해당 구매자 본인에게는 자기 값만 보인다", () => {
    expect(maskTradeDetailBuyerFields(row, "buyer-s")).toMatchObject({ reserved_buyer_id: null, sold_buyer_id: "buyer-s" });
    expect(maskTradeDetailBuyerFields(row, "buyer-r")).toMatchObject({ reserved_buyer_id: "buyer-r", sold_buyer_id: null });
  });
});
