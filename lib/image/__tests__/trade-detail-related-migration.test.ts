import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFeedThumbnailFetchUrl } from "@/lib/media/feed-thumbnail-transform";
import { TRADE_FEED_THUMB_DISPLAY_PX } from "@/lib/media/feed-thumbnail-display";
import {
  imageResolveTradePostDetailRelatedDisplayUrl,
  imageResolveTradePostDetailRelatedThumbRaw,
  loadTradeFeedThumbnailFetchUrl,
  TRADE_POST_DETAIL_RELATED_DISPLAY_PX,
  TRADE_POST_DETAIL_RELATED_TIER_240_ENABLED,
} from "@/lib/image";

const FULL_OBJECT =
  "https://abc.supabase.co/storage/v1/object/public/post-images/user1/related.jpg";
const EXTERNAL_RAW = "https://cdn.example.com/related-thumb.jpg";

function legacyItemThumb(item: {
  thumbnail_url?: string | null;
  images?: unknown;
}): string | null {
  if (typeof item.thumbnail_url === "string" && item.thumbnail_url.trim()) {
    return item.thumbnail_url.trim();
  }
  const firstImage = Array.isArray(item.images)
    ? item.images.find((u): u is string => typeof u === "string" && u.trim().length > 0)
    : null;
  return firstImage ?? null;
}

function legacyRelatedTierDisplayUrl(raw: string): string {
  return buildFeedThumbnailFetchUrl(raw, TRADE_FEED_THUMB_DISPLAY_PX) ?? raw;
}

describe("trade detail related image migration (PostDetailRelatedSections SSOT)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("tier flag enabled by default", () => {
    expect(TRADE_POST_DETAIL_RELATED_TIER_240_ENABLED).toBe(true);
  });

  it("reuses trade feed display px contract", () => {
    expect(TRADE_POST_DETAIL_RELATED_DISPLAY_PX).toBe(TRADE_FEED_THUMB_DISPLAY_PX);
    expect(TRADE_POST_DETAIL_RELATED_DISPLAY_PX).toBe(120);
  });

  it("thumb raw — prefers thumbnail_url", () => {
    const item = {
      thumbnail_url: `  ${FULL_OBJECT}  `,
      images: ["https://ignored.example/first.jpg"],
    };
    expect(imageResolveTradePostDetailRelatedThumbRaw(item)).toBe(
      legacyItemThumb(item)
    );
  });

  it("thumb raw — first image when thumbnail empty", () => {
    const item = {
      thumbnail_url: "",
      images: ["", `  ${FULL_OBJECT}  `, "https://second.example/x.jpg"],
    };
    expect(imageResolveTradePostDetailRelatedThumbRaw(item)).toBe(
      legacyItemThumb(item)
    );
  });

  it("thumb raw — null when no usable URL", () => {
    const item = { thumbnail_url: null, images: [] };
    expect(imageResolveTradePostDetailRelatedThumbRaw(item)).toBeNull();
  });

  it("display URL — post-images full object → width=240 transform (trade feed parity)", () => {
    const legacy = legacyRelatedTierDisplayUrl(FULL_OBJECT);
    const adapter = imageResolveTradePostDetailRelatedDisplayUrl(FULL_OBJECT);
    const feed = loadTradeFeedThumbnailFetchUrl(FULL_OBJECT);
    expect(adapter).toBe(legacy);
    expect(adapter).toBe(feed);
    expect(adapter).toContain("width=240");
    expect(adapter).toContain("height=240");
    expect(adapter).toContain("/render/image/public/post-images/");
    expect(adapter).not.toContain("/object/public/post-images/");
  });

  it("display URL — external URL passthrough", () => {
    expect(imageResolveTradePostDetailRelatedDisplayUrl(EXTERNAL_RAW)).toBe(EXTERNAL_RAW);
  });
});
