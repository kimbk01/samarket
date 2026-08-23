import { describe, expect, it } from "vitest";
import {
  buildDerivativePublicUrl,
  buildOriginalFallbackUrlsFromDerivative,
  derivativeStoragePath,
  parseSupabasePublicObjectUrl,
} from "@/lib/media/canonical-image-path";
import { canonicalStoragePathsForOriginal } from "@/lib/media/canonical-image-upload.server";
import {
  resolveCanonicalDetailImageUrl,
  resolveCanonicalFeedImageUrl,
  resolveCanonicalHeroImageUrl,
} from "@/lib/media/canonical-image-resolver";
import { buildPostImageThumbnailFetchUrl } from "@/lib/media/post-image-transform";

const POST_RAW =
  "https://abc.supabase.co/storage/v1/object/public/post-images/u1/abc.jpg";

describe("canonical-image-path", () => {
  it("derivativeStoragePath — sibling suffix", () => {
    expect(derivativeStoragePath("u1/abc.jpg", "feed")).toBe("u1/abc.feed.webp");
    expect(derivativeStoragePath("s1/p1.webp", "hero")).toBe("s1/p1.hero.webp");
  });

  it("buildDerivativePublicUrl — object/public only", () => {
    const out = buildDerivativePublicUrl(POST_RAW, "feed");
    expect(out).toContain("/object/public/post-images/");
    expect(out).toContain(".feed.webp");
    expect(out).not.toContain("/render/image/");
  });

  it("parseSupabasePublicObjectUrl", () => {
    expect(parseSupabasePublicObjectUrl(POST_RAW)).toEqual({
      bucket: "post-images",
      path: "u1/abc.jpg",
    });
  });

  it("buildOriginalFallbackUrlsFromDerivative", () => {
    const derivative = buildDerivativePublicUrl(POST_RAW, "feed")!;
    const fallbacks = buildOriginalFallbackUrlsFromDerivative(derivative);
    expect(fallbacks[0]).toBe(POST_RAW.replace(".jpg", ".webp"));
    expect(fallbacks).toContain(POST_RAW);
  });

  it("canonicalStoragePathsForOriginal — delete cascade paths", () => {
    expect(canonicalStoragePathsForOriginal("u1/abc.jpg", "post-images")).toEqual([
      "u1/abc.jpg",
      "u1/abc.thumb.webp",
      "u1/abc.feed.webp",
      "u1/abc.detail.webp",
    ]);
  });
});

describe("canonical-image-resolver", () => {
  it("resolveCanonicalFeedImageUrl — no render/image", () => {
    const out = resolveCanonicalFeedImageUrl(POST_RAW);
    expect(out).toContain(".feed.webp");
    expect(out).not.toContain("/render/image/");
  });

  it("resolveCanonicalDetailImageUrl", () => {
    const out = resolveCanonicalDetailImageUrl(POST_RAW);
    expect(out).toContain(".detail.webp");
    expect(out).not.toContain("/render/image/");
  });

  it("buildPostImageThumbnailFetchUrl — Phase 2B derivative", () => {
    const out = buildPostImageThumbnailFetchUrl(POST_RAW, 120);
    expect(out).toContain(".feed.webp");
    expect(out).not.toContain("/render/image/");
  });

  it("store hero resolver", () => {
    const store =
      "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/p1.webp";
    const out = resolveCanonicalHeroImageUrl(store);
    expect(out).toContain(".hero.webp");
    expect(out).not.toContain("/render/image/");
  });
});
