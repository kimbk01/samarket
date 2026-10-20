import { describe, expect, it } from "vitest";
import { filterStoreOwnedImageUrls, isStoreOwnedImageStoragePath } from "@/lib/stores/store-owned-image-urls";

const BASE = "https://proj.supabase.co/storage/v1/object/public";
const SID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("filterStoreOwnedImageUrls (P0-4)", () => {
  it("keeps this store's own upload", () => {
    const own = `${BASE}/store-product-images/${SID}/a.webp`;
    expect(filterStoreOwnedImageUrls(SID, [own])).toEqual([own]);
  });

  it("drops another store's image", () => {
    expect(filterStoreOwnedImageUrls(SID, [`${BASE}/store-product-images/${OTHER}/a.webp`])).toEqual([]);
  });

  it("drops community post-images and external URLs", () => {
    expect(
      filterStoreOwnedImageUrls(SID, [
        `${BASE}/post-images/${SID}/a.webp`,
        "https://example.com/a.png",
        null,
        "",
      ])
    ).toEqual([]);
  });

  it("drops traversal toward another store", () => {
    expect(filterStoreOwnedImageUrls(SID, [`${BASE}/store-product-images/${SID}/../${OTHER}/a.webp`])).toEqual([]);
  });

  it("keeps render URL of own image", () => {
    const render = `https://proj.supabase.co/storage/v1/render/image/public/store-product-images/${SID}/b.webp?width=400`;
    expect(filterStoreOwnedImageUrls(SID, [render])).toEqual([render]);
  });

  it("path predicate rejects prefix collisions and encoded paths", () => {
    expect(isStoreOwnedImageStoragePath(SID, `${SID}x/a.webp`)).toBe(false);
    expect(isStoreOwnedImageStoragePath(SID, `${SID}/%2e%2e/a.webp`)).toBe(false);
    expect(isStoreOwnedImageStoragePath("", `${SID}/a.webp`)).toBe(false);
  });
});
