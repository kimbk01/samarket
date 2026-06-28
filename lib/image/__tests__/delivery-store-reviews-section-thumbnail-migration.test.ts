import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPostImageThumbnailFetchUrl } from "@/lib/media/post-image-transform";
import { buildStoreProductThumbnailFetchUrl } from "@/lib/media/store-product-image-transform";
import {
  STORE_REVIEWS_MENU_FILTER_DISPLAY_PX,
  STORE_REVIEWS_PER_REVIEW_PHOTO_DISPLAY_PX,
  STORE_REVIEWS_SUMMARY_PHOTO_DISPLAY_PX,
  loadStoreReviewsMenuFilterThumbFetchUrl,
  loadStoreReviewsPerReviewPhotoFetchUrl,
  loadStoreReviewsSummaryReviewPhotoFetchUrl,
} from "@/lib/image";

const POST_RAW =
  "https://abc.supabase.co/storage/v1/object/public/post-images/u1/review.webp";
const STORE_RAW =
  "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/menu-item.webp";
const EXTERNAL_RAW = "https://cdn.example.com/thumb.webp";

describe("delivery store reviews section thumbnail migration (StoreReviewsSection SSOT)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("menu filter — display 52 → width=104 byte-identical", () => {
    const legacy = buildStoreProductThumbnailFetchUrl(STORE_RAW, STORE_REVIEWS_MENU_FILTER_DISPLAY_PX);
    const adapter = loadStoreReviewsMenuFilterThumbFetchUrl(STORE_RAW);
    expect(adapter).toBe(legacy);
    expect(adapter).toContain("width=104");
    expect(adapter).toContain("/render/image/public/store-product-images/");
  });

  it("summary photo strip — display 68 → width=136 byte-identical", () => {
    const legacy = buildPostImageThumbnailFetchUrl(POST_RAW, STORE_REVIEWS_SUMMARY_PHOTO_DISPLAY_PX);
    const adapter = loadStoreReviewsSummaryReviewPhotoFetchUrl(POST_RAW);
    expect(adapter).toBe(legacy);
    expect(adapter).toContain("width=136");
    expect(adapter).toContain("/render/image/public/post-images/");
  });

  it("per-review photo strip — display 80 → width=160 byte-identical", () => {
    const legacy = buildPostImageThumbnailFetchUrl(POST_RAW, STORE_REVIEWS_PER_REVIEW_PHOTO_DISPLAY_PX);
    const adapter = loadStoreReviewsPerReviewPhotoFetchUrl(POST_RAW);
    expect(adapter).toBe(legacy);
    expect(adapter).toContain("width=160");
  });

  it("external URL — pass-through byte-identical", () => {
    expect(loadStoreReviewsMenuFilterThumbFetchUrl(EXTERNAL_RAW)).toBe(EXTERNAL_RAW);
    expect(loadStoreReviewsSummaryReviewPhotoFetchUrl(EXTERNAL_RAW)).toBe(EXTERNAL_RAW);
    expect(loadStoreReviewsPerReviewPhotoFetchUrl(EXTERNAL_RAW)).toBe(EXTERNAL_RAW);
  });

  it("empty input — null", () => {
    expect(loadStoreReviewsMenuFilterThumbFetchUrl(null)).toBeNull();
    expect(loadStoreReviewsSummaryReviewPhotoFetchUrl("")).toBeNull();
    expect(loadStoreReviewsPerReviewPhotoFetchUrl("  ")).toBeNull();
  });
});
