import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFeedThumbnailFetchUrl } from "@/lib/media/feed-thumbnail-transform";
import { sanitizeViewerMediaUrl } from "@/lib/media/sanitize-viewer-media-url";
import { TRADE_FEED_THUMB_DISPLAY_PX } from "@/lib/media/feed-thumbnail-display";
import {
  imageSanitizeViewerMediaUrl,
  loadTradeFeedThumbnailFetchUrl,
  TRADE_FEED_THUMB_DISPLAY_PX as ADAPTER_TRADE_FEED_THUMB_DISPLAY_PX,
} from "@/lib/image";

const POST_RAW =
  "https://abc.supabase.co/storage/v1/object/public/post-images/user1/trade/item.jpg";
const STORE_RAW =
  "https://abc.supabase.co/storage/v1/object/public/store-product-images/s1/p1.webp";
const EXTERNAL_RAW = "https://cdn.example.com/photo.jpg";

describe("trade feed thumbnail migration (PostCard SSOT)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("re-exports trade feed display px unchanged", () => {
    expect(ADAPTER_TRADE_FEED_THUMB_DISPLAY_PX).toBe(120);
    expect(ADAPTER_TRADE_FEED_THUMB_DISPLAY_PX).toBe(TRADE_FEED_THUMB_DISPLAY_PX);
  });

  it("sanitize — adapter matches legacy", () => {
    expect(imageSanitizeViewerMediaUrl(POST_RAW)).toBe(sanitizeViewerMediaUrl(POST_RAW));
    expect(imageSanitizeViewerMediaUrl("  ")).toBe(sanitizeViewerMediaUrl("  "));
  });

  it("post-images — Phase 2B feed derivative", () => {
    const adapter = loadTradeFeedThumbnailFetchUrl(POST_RAW);
    const feed = buildFeedThumbnailFetchUrl(POST_RAW, TRADE_FEED_THUMB_DISPLAY_PX);
    expect(adapter).toBe(feed);
    expect(adapter).toContain(".feed.webp");
    expect(adapter).not.toContain("/render/image/");
  });

  it("store-product-images — Phase 2A object/public", () => {
    const adapter = loadTradeFeedThumbnailFetchUrl(STORE_RAW);
    expect(adapter).toBe(STORE_RAW);
    expect(adapter).not.toContain("/render/image/");
  });

  it("external URL — pass-through", () => {
    expect(loadTradeFeedThumbnailFetchUrl(EXTERNAL_RAW)).toBe(EXTERNAL_RAW);
  });

  it("empty input — null", () => {
    expect(loadTradeFeedThumbnailFetchUrl(null)).toBe(null);
  });
});
