import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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

  it("reviewPhoto — post-images tier 320", () => {
    const adapter = loadStoreReviewRailReviewPhotoFetchUrl(POST_RAW);
    expect(adapter).toContain("width=320");
    expect(adapter).toContain("/render/image/public/post-images/");
  });

  it("menuThumb — store-product object/public", () => {
    const adapter = loadStoreReviewRailMenuThumbFetchUrl(STORE_RAW);
    expect(adapter).toBe(STORE_RAW);
    expect(adapter).not.toContain("/render/image/");
  });

  it("external URL — pass-through", () => {
    expect(loadStoreReviewRailReviewPhotoFetchUrl(EXTERNAL_RAW)).toBe(EXTERNAL_RAW);
    expect(loadStoreReviewRailMenuThumbFetchUrl(EXTERNAL_RAW)).toBe(EXTERNAL_RAW);
  });

  it("buildStoreReviewPreviewSlides — reviewPhoto branch uses tier transform", () => {
    const slides = buildStoreReviewPreviewSlides(
      [{ id: "r1", rating: 5, content: "good", product_id: "p1", image_urls: [POST_RAW] }],
      [{ id: "p1", title: "T", thumbnail_url: STORE_RAW, is_representative: false }]
    );
    expect(slides[0]?.thumbUrl).toContain("width=320");
  });

  it("buildStoreReviewPreviewSlides — menuThumb fallback uses object/public", () => {
    const slides = buildStoreReviewPreviewSlides(
      [{ id: "r1", rating: 5, content: "good", product_id: "p1", image_urls: [] }],
      [{ id: "p1", title: "T", thumbnail_url: STORE_RAW, is_representative: false }]
    );
    expect(slides[0]?.thumbUrl).toBe(STORE_RAW);
  });

  it("empty input — null", () => {
    expect(loadStoreReviewRailReviewPhotoFetchUrl(null)).toBeNull();
    expect(loadStoreReviewRailMenuThumbFetchUrl("")).toBeNull();
  });
});
