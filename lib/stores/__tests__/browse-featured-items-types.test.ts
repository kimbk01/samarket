import { describe, expect, it, vi } from "vitest";
import {
  BROWSE_FEATURED_ITEMS_PER_STORE_MAX,
  mapFeaturedDtoToCardItems,
  resolveBrowseFeaturedMenuImageUrl,
} from "@/lib/stores/browse-featured-items-types";

describe("BROWSE_FEATURED_ITEMS_PER_STORE_MAX", () => {
  it("browse 카드 가로 스크롤 상한은 6", () => {
    expect(BROWSE_FEATURED_ITEMS_PER_STORE_MAX).toBe(6);
  });
});

describe("resolveBrowseFeaturedMenuImageUrl", () => {
  it("assembles bare storage path", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    expect(resolveBrowseFeaturedMenuImageUrl("s1/p1.webp")).toBe(
      "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/p1.webp"
    );
    vi.unstubAllEnvs();
  });
});

describe("mapFeaturedDtoToCardItems", () => {
  it("서버 정규화 URL pass-through", () => {
    const items = mapFeaturedDtoToCardItems([
      { id: "p1", name: "A", thumbnail_url: "https://x/a.jpg", price: 100, badge: null },
    ]);
    expect(items).toEqual([
      { productId: "p1", name: "A", price: 100, imageUrl: "https://x/a.jpg" },
    ]);
  });

  it("빈 thumbnail_url 은 imageUrl null", () => {
    const items = mapFeaturedDtoToCardItems([
      { id: "p2", name: "B", thumbnail_url: null, price: 50, badge: null },
    ]);
    expect(items[0]?.imageUrl).toBeNull();
  });
});
