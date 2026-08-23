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

  it("display URL — post-images → feed derivative", () => {
    const adapter = imageResolveTradePostDetailRelatedDisplayUrl(FULL_OBJECT);
    const feed = loadTradeFeedThumbnailFetchUrl(FULL_OBJECT);
    expect(adapter).toBe(feed);
    expect(adapter).toContain(".feed.webp");
    expect(adapter).not.toContain("/render/image/");
  });

  it("display URL — external URL passthrough", () => {
    expect(imageResolveTradePostDetailRelatedDisplayUrl(EXTERNAL_RAW)).toBe(EXTERNAL_RAW);
  });

  it("thumb raw — prefers thumbnail_url", () => {
    const item = {
      thumbnail_url: `  ${FULL_OBJECT}  `,
      images: ["https://ignored.example/first.jpg"],
    };
    expect(imageResolveTradePostDetailRelatedThumbRaw(item)).toBe(FULL_OBJECT);
  });
});
