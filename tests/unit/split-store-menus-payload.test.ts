import { describe, expect, it } from "vitest";
import {
  buildStoreMenusCoreApply,
  buildStoreMenusStripsApply,
} from "@/lib/dibay/split-store-menus-payload";
import type { StoreMenusPayload } from "@/lib/stores/store-detail-split-types";

const samplePayload: StoreMenusPayload = {
  ok: true,
  products: [
    {
      id: "p1",
      title: "Burger",
      price: 100,
      sort_order: 1,
      menu_section_id: "s1",
      store_menu_sections: { id: "s1", name: "Main", sort_order: 0 },
    },
    {
      id: "p2",
      title: "Fries",
      price: 50,
      sort_order: 2,
      is_owner_recommended: true,
      menu_section_id: "s1",
      store_menu_sections: { id: "s1", name: "Main", sort_order: 0 },
    },
  ],
  popularProductIds: ["p1"],
  recommendedProductIds: [],
  meta: { canSell: true, viewer_favorited: false, favorite_count: 3 },
};

describe("split-store-menus-payload", () => {
  it("core apply parses products without strips", () => {
    const core = buildStoreMenusCoreApply(samplePayload);
    expect(core.products).toHaveLength(2);
    expect(core.canSell).toBe(true);
    expect(core.productRowsById.p1).toBeDefined();
  });

  it("strips apply uses pre-ranked products without re-fetch", () => {
    const core = buildStoreMenusCoreApply(samplePayload);
    const strips = buildStoreMenusStripsApply(samplePayload, core.products);
    expect(strips.popularMenuCards.map((c) => c.id)).toEqual(["p1"]);
    expect(strips.recommendedMenuCards.length).toBeGreaterThan(0);
    expect(strips.favoriteSeed.favoriteCount).toBe(3);
  });
});
