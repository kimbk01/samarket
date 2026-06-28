import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPostImageThumbnailFetchUrl } from "@/lib/media/post-image-transform";
import { buildStoreProductThumbnailFetchUrl } from "@/lib/media/store-product-image-transform";
import {
  STORE_REVIEW_RAIL_THUMB_DISPLAY_PX,
  loadStoreReviewRailMenuThumbFetchUrl,
  loadStoreReviewRailReviewPhotoFetchUrl,
} from "@/lib/image";
import { buildStoreReviewPreviewSlides } from "@/lib/stores/store-review-preview-slides";

const POST_RAW =
  "https://abc.supabase.co/storage/v1/object/public/post-images/u1/review.webp";
const STORE_RAW =
  "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/menu-item.webp";
const EXTERNAL_RAW = "https://cdn.example.com/thumb.webp";

describe("delivery review rail thumbnail migration (StoreMenuReviewFlowLink SSOT)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reviewPhoto — post-images display 56 → width=112 byte-identical", () => {
    const legacy = buildPostImageThumbnailFetchUrl(POST_RAW, STORE_REVIEW_RAIL_THUMB_DISPLAY_PX);
    const adapter = loadStoreReviewRailReviewPhotoFetchUrl(POST_RAW);
    expect(adapter).toBe(legacy);
    expect(adapter).toContain("width=112");
    expect(adapter).toContain("/render/image/public/post-images/");
  });

  it("menuThumb — store-product display 56 → width=112 byte-identical", () => {
    const legacy = buildStoreProductThumbnailFetchUrl(STORE_RAW, STORE_REVIEW_RAIL_THUMB_DISPLAY_PX);
    const adapter = loadStoreReviewRailMenuThumbFetchUrl(STORE_RAW);
    expect(adapter).toBe(legacy);
    expect(adapter).toContain("width=112");
    expect(adapter).toContain("/render/image/public/store-product-images/");
  });

  it("external URL — pass-through byte-identical", () => {
    expect(loadStoreReviewRailReviewPhotoFetchUrl(EXTERNAL_RAW)).toBe(EXTERNAL_RAW);
    expect(loadStoreReviewRailMenuThumbFetchUrl(EXTERNAL_RAW)).toBe(EXTERNAL_RAW);
  });

  it("buildStoreReviewPreviewSlides — reviewPhoto branch uses post transform", () => {
    const slides = buildStoreReviewPreviewSlides(
      [{ id: "r1", rating: 5, content: "good", product_id: "p1", image_urls: [POST_RAW] }],
      [{ id: "p1", title: "T", thumbnail_url: STORE_RAW, is_representative: false }]
    );
    expect(slides[0]?.hasPhoto).toBe(true);
    expect(slides[0]?.thumbUrl).toBe(loadStoreReviewRailReviewPhotoFetchUrl(POST_RAW));
    expect(slides[0]?.thumbUrl).toContain("/render/image/public/post-images/");
  });

  it("buildStoreReviewPreviewSlides — menuThumb fallback uses store transform", () => {
    const slides = buildStoreReviewPreviewSlides(
      [{ id: "r1", rating: 5, content: "good", product_id: "p1", image_urls: [] }],
      [{ id: "p1", title: "T", thumbnail_url: STORE_RAW, is_representative: false }]
    );
    expect(slides[0]?.hasPhoto).toBe(false);
    expect(slides[0]?.thumbUrl).toBe(loadStoreReviewRailMenuThumbFetchUrl(STORE_RAW));
    expect(slides[0]?.thumbUrl).toContain("/render/image/public/store-product-images/");
  });

  it("empty input — null", () => {
    expect(loadStoreReviewRailReviewPhotoFetchUrl(null)).toBeNull();
    expect(loadStoreReviewRailMenuThumbFetchUrl("")).toBeNull();
  });
});
