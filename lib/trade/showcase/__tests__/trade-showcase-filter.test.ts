import { describe, expect, it } from "vitest";
import { filterTradeShowcaseForSearch } from "@/lib/trade/showcase/trade-showcase-filter";
import { planTradeShowcaseInterleave, type TradeShowcaseItem } from "@/lib/trade/showcase/trade-showcase-model";

const CAR = "50feae02-9fb9-4b59-8ab7-7e43a0f5c407";
const mk = (sort_order: number, price: number, cat = CAR): TradeShowcaseItem => ({
  id: String(sort_order),
  trade_category_id: cat,
  title: "x",
  price,
  price_note: null,
  region_label: null,
  description: null,
  image_urls: [],
  sort_order,
  is_active: true,
  created_at: "",
  updated_at: "",
});
// 201 Toyota Vios · 211 Honda City · 221 Mitsubishi Mirage (카탈로그)
const items = [mk(201, 480000), mk(211, 820000), mk(221, 350000)];

describe("샘플도 목록 조건을 따른다 (2026-10-28 실기)", () => {
  it("제조사 Toyota → Toyota 샘플만", () => {
    expect(filterTradeShowcaseForSearch(items, "category=" + CAR + "&filters[make]=toyota").map((i) => i.id)).toEqual(["201"]);
  });
  it("모델 vios", () => {
    expect(filterTradeShowcaseForSearch(items, "filters[make]=toyota&filters[model]=vios").map((i) => i.id)).toEqual(["201"]);
  });
  it("팝니다(car_trade=sell)는 유지, 삽니다(buy)는 없음", () => {
    expect(filterTradeShowcaseForSearch(items, "filters[car_trade]=sell")).toHaveLength(3);
    expect(filterTradeShowcaseForSearch(items, "filters[car_trade]=buy")).toHaveLength(0);
  });
  it("가격 범위·판매완료만", () => {
    expect(filterTradeShowcaseForSearch(items, "priceMin=400000&priceMax=900000").map((i) => i.id)).toEqual(["201", "211"]);
    expect(filterTradeShowcaseForSearch(items, "tradeState=sold")).toEqual([]);
  });
  it("남은 샘플은 「다른 물품」 앞에, 그 뒤 실제 글 사이엔 끼우지 않음", () => {
    const posts = [
      { id: "a", status: "active", list_section: "" },
      { id: "b", status: "active", list_section: "cat:other" },
      { id: "c", status: "active", list_section: "cat:other" },
      { id: "d", status: "active", list_section: "cat:other" },
      { id: "e", status: "active", list_section: "cat:other" },
    ];
    const plan = planTradeShowcaseInterleave(posts, ["s1", "s2"]);
    expect(plan.afterPostId.size).toBe(0);
    expect(plan.firstSoldId).toBe("b");
    expect(plan.rest).toEqual(["s1", "s2"]);
  });
});
