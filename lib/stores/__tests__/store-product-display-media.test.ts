import { describe, expect, it } from "vitest";
import {
  buildStoreProductGalleryUrls,
  resolveStoreProductPrimaryImageUrl,
} from "@/lib/stores/store-product-display-media";

describe("store-product-display-media", () => {
  it("uses thumbnail first in gallery", () => {
    const urls = buildStoreProductGalleryUrls(
      "https://cdn.example/thumb.jpg",
      ["https://cdn.example/extra.jpg"]
    );
    expect(urls[0]).toBe("https://cdn.example/thumb.jpg");
    expect(urls).toHaveLength(2);
  });

  it("resolveStoreProductPrimaryImageUrl falls back to images_json", () => {
    const u = resolveStoreProductPrimaryImageUrl(null, ["https://cdn.example/a.webp"]);
    expect(u).toBe("https://cdn.example/a.webp");
  });
});
