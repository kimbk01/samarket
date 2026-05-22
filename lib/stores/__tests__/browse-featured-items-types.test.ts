import { describe, expect, it } from "vitest";
import {
  BROWSE_FEATURED_ITEMS_PER_STORE_MAX,
  mapFeaturedDtoToCardItems,
} from "@/lib/stores/browse-featured-items-types";

describe("BROWSE_FEATURED_ITEMS_PER_STORE_MAX", () => {
  it("browse 카드 가로 스크롤 상한은 6", () => {
    expect(BROWSE_FEATURED_ITEMS_PER_STORE_MAX).toBe(6);
  });
});

describe("mapFeaturedDtoToCardItems", () => {
  it("DTO 를 카드 featuredItems 로 매핑", () => {
    const items = mapFeaturedDtoToCardItems([
      { id: "p1", name: "A", thumbnail_url: "https://x/a.jpg", price: 100, badge: null },
    ]);
    expect(items).toEqual([
      { productId: "p1", name: "A", price: 100, imageUrl: "https://x/a.jpg" },
    ]);
  });
});
