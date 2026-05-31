import { describe, expect, it } from "vitest";
import {
  attachReviewCountsToRailProducts,
  buildStoreMenuReviewRailProducts,
} from "@/lib/stores/build-store-menu-review-rail-products";
import type { StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";

function card(id: string, title: string, flags: Partial<StoreDetailProductCard> = {}): StoreDetailProductCard {
  return {
    id,
    title,
    summary: null,
    price: 1000,
    discount_price: null,
    discount_percent: null,
    track_inventory: false,
    stock_qty: 0,
    thumbnail_url: null,
    pickup_available: true,
    local_delivery_available: true,
    shipping_available: false,
    is_featured: false,
    is_owner_recommended: false,
    is_representative: false,
    item_type: "menu",
    categoryName: null,
    menu_section_id: null,
    menuSectionSort: 0,
    sort_order: 0,
    has_options: false,
    min_order_qty: 1,
    max_order_qty: 99,
    product_status: "active",
    ...flags,
  };
}

describe("buildStoreMenuReviewRailProducts", () => {
  it("대표 메뉴를 인기보다 앞에 둔다", () => {
    const popular = [card("p1", "Popular", { is_representative: false })];
    const rep = [card("r1", "Rep", { is_representative: true })];
    const out = buildStoreMenuReviewRailProducts({
      popularMenuCards: popular,
      recommendedMenuCards: [],
      menuSectionItems: [...popular, ...rep],
    });
    expect(out[0]?.id).toBe("r1");
    expect(out.some((x) => x.id === "p1")).toBe(true);
  });

  it("리뷰 수를 product_id 로 붙인다", () => {
    const products = buildStoreMenuReviewRailProducts({
      popularMenuCards: [card("a", "A")],
      recommendedMenuCards: [],
      menuSectionItems: [],
    });
    const withCounts = attachReviewCountsToRailProducts(products, [
      { product_id: "a" },
      { product_id: "a" },
    ]);
    expect(withCounts[0]?.reviewCount).toBe(2);
  });
});
