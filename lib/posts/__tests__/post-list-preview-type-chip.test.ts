import { describe, expect, it } from "vitest";
import { buildPostListPreviewModel } from "@/lib/posts/post-list-preview-model";

describe("buildPostListPreviewModel type chip", () => {
  it("general trade: shows For sale, not In-person deal, even when direct_deal is true", () => {
    const model = buildPostListPreviewModel(
      {
        type: "trade",
        title: "Blue mug",
        price: 100,
        meta: { direct_deal: true },
        created_at: "2026-07-01T00:00:00.000Z",
      },
      { locale: "en", currency: "PHP", skinKey: "general" }
    );
    expect(model?.listingChips.map((c) => c.text)).toEqual(["For sale"]);
    expect(model?.listingChips.some((c) => c.text === "In-person deal")).toBe(false);
  });

  it("general trade: title with 삽니다 → Wanted", () => {
    const model = buildPostListPreviewModel(
      {
        type: "trade",
        title: "아이폰 삽니다",
        price: null,
        meta: {},
        created_at: "2026-07-01T00:00:00.000Z",
      },
      { locale: "en", currency: "PHP", skinKey: "general" }
    );
    expect(model?.listingChips.map((c) => c.text)).toEqual(["Wanted"]);
  });

  it("general trade ko: 팝니다", () => {
    const model = buildPostListPreviewModel(
      {
        type: "trade",
        title: "중고",
        price: 50,
        meta: { direct_deal: true },
        created_at: "2026-07-01T00:00:00.000Z",
      },
      { locale: "ko", currency: "PHP", skinKey: "general" }
    );
    expect(model?.listingChips.map((c) => c.text)).toEqual(["팝니다"]);
  });

  it("used-car: car_trade buy/sell → Wanted / For sale", () => {
    const sell = buildPostListPreviewModel(
      {
        type: "trade",
        title: "Car",
        price: 1000,
        meta: { car_trade: "sell", car_model: "Vios" },
        created_at: "2026-07-01T00:00:00.000Z",
      },
      { locale: "en", currency: "PHP", skinKey: "used-car" }
    );
    const buy = buildPostListPreviewModel(
      {
        type: "trade",
        title: "Car",
        price: null,
        meta: { car_trade: "buy", car_body_type: "sedan" },
        created_at: "2026-07-01T00:00:00.000Z",
      },
      { locale: "en", currency: "PHP", skinKey: "used-car" }
    );
    expect(sell?.listingChips.map((c) => c.text)).toEqual(["For sale"]);
    expect(buy?.listingChips.map((c) => c.text)).toEqual(["Wanted"]);
  });

  it("real-estate: keeps deal_type chip, not sell/buy substitute", () => {
    const model = buildPostListPreviewModel(
      {
        type: "trade",
        title: "Condo",
        price: 20000,
        meta: { deal_type: "판매", estate_type: "콘도" },
        created_at: "2026-07-01T00:00:00.000Z",
      },
      { locale: "ko", currency: "PHP", skinKey: "real-estate" }
    );
    expect(model?.listingChips.map((c) => c.text)).toEqual(["판매"]);
  });
});
