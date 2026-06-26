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

/** Delivery Menu list row — `StorePublicMenuList` size 88. */
const MENU_LIST_DISPLAY_PX = 88;

function legacyMenuListThumbUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return buildStoreProductThumbnailFetchUrl(raw, MENU_LIST_DISPLAY_PX) ?? raw;
}

function adapterMenuListThumbUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return loadStoreProductThumbnailFetchUrl(raw, MENU_LIST_DISPLAY_PX) ?? raw;
}

describe("delivery menu thumbnail migration (StoreProductThumbnail SSOT)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("menu list row — display 88 → width=176 byte-identical", () => {
    const legacy = legacyMenuListThumbUrl(STORE_RAW);
    const adapter = adapterMenuListThumbUrl(STORE_RAW);
    expect(adapter).toBe(legacy);
    expect(adapter).toContain("width=176");
    expect(adapter).toContain("height=176");
    expect(adapter).toContain("/render/image/public/store-product-images/");
  });

  it("menu preset — width=184 byte-identical", () => {
    const legacy =
      buildStoreProductThumbnailFetchUrlFromPreset(STORE_RAW, "menu") ?? STORE_RAW;
    const adapter =
      loadStoreProductThumbnailFetchUrlFromPreset(STORE_RAW, "menu") ?? STORE_RAW;
    expect(adapter).toBe(legacy);
    expect(adapter).toContain("width=184");
  });

  it("rowFeatured preset — width=232 byte-identical", () => {
    const legacy =
      buildStoreProductThumbnailFetchUrlFromPreset(STORE_RAW, "rowFeatured") ?? STORE_RAW;
    const adapter =
      loadStoreProductThumbnailFetchUrlFromPreset(STORE_RAW, "rowFeatured") ?? STORE_RAW;
    expect(adapter).toBe(legacy);
    expect(adapter).toContain("width=232");
  });

  it("external URL — pass-through byte-identical", () => {
    const legacy = legacyMenuListThumbUrl(EXTERNAL_RAW);
    const adapter = adapterMenuListThumbUrl(EXTERNAL_RAW);
    expect(adapter).toBe(legacy);
    expect(adapter).toBe(EXTERNAL_RAW);
  });

  it("empty input — null", () => {
    expect(adapterMenuListThumbUrl(null)).toBeNull();
    expect(legacyMenuListThumbUrl(null)).toBeNull();
  });
});
