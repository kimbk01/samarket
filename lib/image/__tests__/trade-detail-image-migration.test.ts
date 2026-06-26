import { describe, expect, it } from "vitest";
import {
  imageResolveTradePostDetailDisplayUrl,
  imageResolveTradePostDetailImageUrls,
} from "@/lib/image";

const FULL_OBJECT =
  "https://abc.supabase.co/storage/v1/object/public/post-images/user1/trade/hero.jpg";

function legacyResolveTradePostDetailImageUrls(post: {
  images?: unknown;
  thumbnail_url?: string | null;
}): string[] {
  const imgArr = Array.isArray(post.images)
    ? post.images.filter((s): s is string => typeof s === "string")
    : [];
  if (imgArr.length > 0) return imgArr;
  const t = post.thumbnail_url;
  return typeof t === "string" && t.trim() ? [t.trim()] : [];
}

function legacyDisplayUrl(raw: string): string {
  return raw;
}

describe("trade detail image migration (ProductImageGallery SSOT)", () => {
  it("image list — multi images byte-identical", () => {
    const post = {
      images: [FULL_OBJECT, `${FULL_OBJECT}?v=2`],
      thumbnail_url: "https://ignored.example/thumb.jpg",
    };
    expect(imageResolveTradePostDetailImageUrls(post)).toEqual(
      legacyResolveTradePostDetailImageUrls(post)
    );
  });

  it("image list — thumbnail fallback when images empty", () => {
    const post = { images: [], thumbnail_url: `  ${FULL_OBJECT}  ` };
    expect(imageResolveTradePostDetailImageUrls(post)).toEqual(
      legacyResolveTradePostDetailImageUrls(post)
    );
  });

  it("image list — empty", () => {
    const post = { images: null, thumbnail_url: null };
    expect(imageResolveTradePostDetailImageUrls(post)).toEqual([]);
  });

  it("display URL — full object passthrough (no transform in Phase 1)", () => {
    const legacy = legacyDisplayUrl(FULL_OBJECT);
    const adapter = imageResolveTradePostDetailDisplayUrl(FULL_OBJECT);
    expect(adapter).toBe(legacy);
    expect(adapter).toContain("/object/public/post-images/");
    expect(adapter).not.toContain("/render/image/");
  });

  it("display URL — preserves query string byte-identical", () => {
    const url = `${FULL_OBJECT}?token=abc`;
    expect(imageResolveTradePostDetailDisplayUrl(url)).toBe(url);
  });
});
