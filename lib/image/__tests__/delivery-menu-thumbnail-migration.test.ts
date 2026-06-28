import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildStoreProductThumbnailFetchUrl,
  buildStoreProductThumbnailFetchUrlFromPreset,
} from "@/lib/media/store-product-image-transform";
import {
  loadStoreProductThumbnailFetchUrl,
  loadStoreProductThumbnailFetchUrlFromPreset,
} from "@/lib/image";

const STORE_RAW =
  "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/menu-item.webp";
const EXTERNAL_RAW = "https://cdn.example.com/thumb.webp";

const MENU_LIST_DISPLAY_PX = 88;

describe("delivery menu thumbnail migration (StoreProductThumbnail SSOT)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("menu list row — Phase 2A object/public", () => {
    const adapter = loadStoreProductThumbnailFetchUrl(STORE_RAW, MENU_LIST_DISPLAY_PX);
    const direct = buildStoreProductThumbnailFetchUrl(STORE_RAW, MENU_LIST_DISPLAY_PX);
    expect(adapter).toBe(direct);
    expect(adapter).toBe(STORE_RAW);
    expect(adapter).not.toContain("/render/image/");
  });

  it("menu preset — object/public", () => {
    const adapter = loadStoreProductThumbnailFetchUrlFromPreset(STORE_RAW, "menu");
    expect(adapter).toBe(STORE_RAW);
    expect(adapter).not.toContain("/render/image/");
  });

  it("rowFeatured preset — object/public", () => {
    const adapter = loadStoreProductThumbnailFetchUrlFromPreset(STORE_RAW, "rowFeatured");
    expect(adapter).toBe(STORE_RAW);
  });

  it("external URL — pass-through", () => {
    expect(loadStoreProductThumbnailFetchUrl(EXTERNAL_RAW, MENU_LIST_DISPLAY_PX)).toBe(EXTERNAL_RAW);
  });

  it("empty input — null", () => {
    expect(loadStoreProductThumbnailFetchUrl(null, MENU_LIST_DISPLAY_PX)).toBeNull();
  });
});
