import { describe, expect, it } from "vitest";
import {
  buildPostListPreviewModel,
  POST_LIST_TYPE_CHIP,
} from "@/lib/posts/post-list-preview-model";

const opts = (locale: string, skinKey: string) => ({
  locale,
  currency: "PHP",
  skinKey,
});

describe("buildPostListPreviewModel type chip", () => {
  it("general: 팝니다 / For sale — not In-person deal", () => {
    const ko = buildPostListPreviewModel(
      {
        type: "trade",
        title: "Blue mug",
        price: 100,
        meta: { direct_deal: true },
        created_at: "2026-07-01T00:00:00.000Z",
      },
      opts("ko", "general")
    );
    const en = buildPostListPreviewModel(
      {
        type: "trade",
        title: "Blue mug",
        price: 100,
        meta: { direct_deal: true },
        created_at: "2026-07-01T00:00:00.000Z",
      },
      opts("en", "general")
    );
    expect(ko?.listingChips).toEqual([{ text: "팝니다", className: POST_LIST_TYPE_CHIP }]);
    expect(en?.listingChips).toEqual([{ text: "For sale", className: POST_LIST_TYPE_CHIP }]);
  });

  it("general: category 삽니다 → Wanted", () => {
    const model = buildPostListPreviewModel(
      {
        type: "trade",
        title: "아이폰",
        category_name: "삽니다",
        price: null,
        meta: {},
        created_at: "2026-07-01T00:00:00.000Z",
      },
      opts("en", "general")
    );
    expect(model?.listingChips.map((c) => c.text)).toEqual(["Wanted"]);
  });

  it("used-car: car_trade → same chip style", () => {
    const sell = buildPostListPreviewModel(
      {
        type: "trade",
        title: "Car",
        price: 1000,
        meta: { car_trade: "sell", car_model: "Vios" },
        created_at: "2026-07-01T00:00:00.000Z",
      },
      opts("ko", "used-car")
    );
    const buy = buildPostListPreviewModel(
      {
        type: "trade",
        title: "Car",
        price: null,
        meta: { car_trade: "buy", car_body_type: "sedan" },
        created_at: "2026-07-01T00:00:00.000Z",
      },
      opts("en", "used-car")
    );
    expect(sell?.listingChips).toEqual([{ text: "팝니다", className: POST_LIST_TYPE_CHIP }]);
    expect(buy?.listingChips).toEqual([{ text: "Wanted", className: POST_LIST_TYPE_CHIP }]);
  });

  it("real-estate: deal_type with same chip style", () => {
    const model = buildPostListPreviewModel(
      {
        type: "trade",
        title: "Condo",
        price: 20000,
        meta: { deal_type: "판매", estate_type: "콘도" },
        created_at: "2026-07-01T00:00:00.000Z",
      },
      opts("ko", "real-estate")
    );
    expect(model?.listingChips).toEqual([{ text: "판매", className: POST_LIST_TYPE_CHIP }]);
  });

  it("exchange: peso buy/sell type chip, not title", () => {
    const model = buildPostListPreviewModel(
      {
        type: "trade",
        title: "Custom title",
        price: 1000,
        meta: { exchange_direction: "buy", from_currency: "PHP" },
        created_at: "2026-07-01T00:00:00.000Z",
      },
      opts("ko", "exchange")
    );
    expect(model?.listingChips?.[0]?.className).toBe(POST_LIST_TYPE_CHIP);
    expect(model?.listingChips?.[0]?.text).toBe("페소 삽니다");
  });

  it("jobs: listing kind with same chip style", () => {
    const model = buildPostListPreviewModel(
      {
        type: "trade",
        title: "Staff",
        price: null,
        meta: { listing_kind: "hire", pay_type: "day" },
        created_at: "2026-07-01T00:00:00.000Z",
      },
      opts("ko", "jobs")
    );
    expect(model?.listingChips?.[0]?.className).toBe(POST_LIST_TYPE_CHIP);
    expect(model?.listingChips?.[0]?.text).toBeTruthy();
  });
});
