import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  imageResolveTradePostDetailDisplayUrl,
  imageResolveTradePostDetailImageUrls,
  TRADE_POST_DETAIL_TIER_FETCH_PX,
} from "@/lib/image";

const FULL_OBJECT =
  "https://abc.supabase.co/storage/v1/object/public/post-images/user1/trade/hero.jpg";
const EXTERNAL_RAW = "https://cdn.example.com/photo.jpg";

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

describe("trade detail image migration (ProductImageGallery SSOT)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("image list — still raw storage URLs (unchanged collection)", () => {
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

  it("display URL — post-images → detail derivative", () => {
    const adapter = imageResolveTradePostDetailDisplayUrl(FULL_OBJECT);
    expect(adapter).toContain(".detail.webp");
    expect(adapter).not.toContain("/render/image/");
    expect(adapter).toContain("/object/public/post-images/");
  });

  it("display URL — external URL pass-through", () => {
    expect(imageResolveTradePostDetailDisplayUrl(EXTERNAL_RAW)).toBe(EXTERNAL_RAW);
  });

  it("tier fetch px constant is 1280 only", () => {
    expect(TRADE_POST_DETAIL_TIER_FETCH_PX).toBe(1280);
  });
});
