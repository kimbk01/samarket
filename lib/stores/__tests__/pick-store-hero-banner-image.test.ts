import { describe, expect, it } from "vitest";
import {
  mapFirstStoreBannerImageByStoreId,
  pickFirstActiveStoreBannerImageUrl,
} from "@/lib/stores/pick-store-hero-banner-image";

describe("pick-store-hero-banner-image", () => {
  it("picks first active banner by sort_order", () => {
    const url = pickFirstActiveStoreBannerImageUrl([
      { id: "b2", image_url: "https://cdn/b2.jpg", sort_order: 2 },
      { id: "b1", image_url: "https://cdn/b1.jpg", sort_order: 1 },
    ]);
    expect(url).toBe("https://cdn/b1.jpg");
  });

  it("skips inactive banners", () => {
    const url = pickFirstActiveStoreBannerImageUrl([
      { id: "b1", image_url: "https://cdn/off.jpg", sort_order: 0, is_active: false },
      { id: "b2", image_url: "https://cdn/on.jpg", sort_order: 1 },
    ]);
    expect(url).toBe("https://cdn/on.jpg");
  });

  it("maps first banner per store", () => {
    const map = mapFirstStoreBannerImageByStoreId([
      { store_id: "s1", id: "b1", image_url: "https://cdn/s1.jpg", sort_order: 0 },
      { store_id: "s2", id: "b2", image_url: "https://cdn/s2.jpg", sort_order: 0 },
    ]);
    expect(map.get("s1")).toBe("https://cdn/s1.jpg");
    expect(map.get("s2")).toBe("https://cdn/s2.jpg");
  });
});
