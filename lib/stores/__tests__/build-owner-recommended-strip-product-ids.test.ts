import { describe, expect, it } from "vitest";
import {
  buildOwnerRecommendedStripProductIds,
  RECOMMENDED_MENU_STRIP_MAX,
  type StoreDetailProductCard,
} from "@/lib/stores/group-store-products-by-menu";

function card(
  id: string,
  opts: Partial<StoreDetailProductCard> & Pick<StoreDetailProductCard, "title">
): StoreDetailProductCard {
  return {
    id,
    title: opts.title,
    summary: opts.summary ?? null,
    price: opts.price ?? 1000,
    discount_price: opts.discount_price ?? null,
    discount_percent: opts.discount_percent ?? null,
    track_inventory: opts.track_inventory ?? false,
    stock_qty: opts.stock_qty ?? 0,
    thumbnail_url: opts.thumbnail_url ?? null,
    pickup_available: opts.pickup_available ?? null,
    local_delivery_available: opts.local_delivery_available ?? null,
    shipping_available: opts.shipping_available ?? null,
    is_featured: opts.is_featured ?? false,
    is_owner_recommended: opts.is_owner_recommended ?? false,
    is_representative: opts.is_representative ?? false,
    item_type: opts.item_type ?? "menu",
    categoryName: opts.categoryName ?? "A",
    menu_section_id: opts.menu_section_id ?? "s1",
    menuSectionSort: opts.menuSectionSort ?? 0,
    sort_order: opts.sort_order ?? 0,
    has_options: opts.has_options ?? false,
    min_order_qty: opts.min_order_qty ?? 1,
    max_order_qty: opts.max_order_qty ?? 99,
    product_status: opts.product_status ?? "active",
    popular_rank: opts.popular_rank ?? null,
  };
}

describe("buildOwnerRecommendedStripProductIds", () => {
  it("returns only owner recommended, sorted by sort_order", () => {
    const cards = [
      card("o2", { title: "B", is_owner_recommended: true, sort_order: 5 }),
      card("x", { title: "X", sort_order: 0 }),
      card("o1", { title: "A", is_owner_recommended: true, sort_order: 1 }),
    ];
    expect(buildOwnerRecommendedStripProductIds(cards, RECOMMENDED_MENU_STRIP_MAX)).toEqual(["o1", "o2"]);
  });

  it("excludes platform popular ids (Popular section dedupe)", () => {
    const cards = [
      card("p1", { title: "Pop", is_owner_recommended: true, sort_order: 0 }),
      card("o1", { title: "Owner", is_owner_recommended: true, sort_order: 1 }),
    ];
    expect(buildOwnerRecommendedStripProductIds(cards, 5, ["p1"])).toEqual(["o1"]);
  });

  it("does not include non-owner popular-only products", () => {
    const cards = [
      card("p1", { title: "Pop", sort_order: 0 }),
      card("p2", { title: "Pop2", sort_order: 1 }),
      card("o1", { title: "Owner", is_owner_recommended: true, sort_order: 2 }),
    ];
    expect(buildOwnerRecommendedStripProductIds(cards, 5, ["p1", "p2"])).toEqual(["o1"]);
  });

  it("returns empty when no owner recommended", () => {
    const cards = [card("p1", { title: "Pop", sort_order: 0 })];
    expect(buildOwnerRecommendedStripProductIds(cards, 5)).toEqual([]);
  });
});
