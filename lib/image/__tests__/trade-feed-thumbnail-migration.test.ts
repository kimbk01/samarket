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

function legacyTradeFeedThumbnailFetchUrl(raw: string | null | undefined): string | null {
  const sanitized = sanitizeViewerMediaUrl(raw);
  if (!sanitized) return null;
  return buildFeedThumbnailFetchUrl(sanitized, TRADE_FEED_THUMB_DISPLAY_PX) ?? sanitized;
}

function adapterTradeFeedThumbnailFetchUrl(raw: string | null | undefined): string | null {
  const sanitized = imageSanitizeViewerMediaUrl(raw);
  if (!sanitized) return null;
  return loadTradeFeedThumbnailFetchUrl(sanitized) ?? sanitized;
}

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

  it("post-images — legacy URL equals adapter URL (width=240)", () => {
    const legacy = legacyTradeFeedThumbnailFetchUrl(POST_RAW);
    const adapter = adapterTradeFeedThumbnailFetchUrl(POST_RAW);
    expect(adapter).toBe(legacy);
    expect(adapter).toContain("width=240");
    expect(adapter).toContain("height=240");
  });

  it("store-product-images — legacy URL equals adapter URL", () => {
    const legacy = legacyTradeFeedThumbnailFetchUrl(STORE_RAW);
    const adapter = adapterTradeFeedThumbnailFetchUrl(STORE_RAW);
    expect(adapter).toBe(legacy);
  });

  it("external URL — pass-through byte-identical", () => {
    const legacy = legacyTradeFeedThumbnailFetchUrl(EXTERNAL_RAW);
    const adapter = adapterTradeFeedThumbnailFetchUrl(EXTERNAL_RAW);
    expect(adapter).toBe(legacy);
    expect(adapter).toBe(EXTERNAL_RAW);
  });

  it("empty input — null", () => {
    expect(adapterTradeFeedThumbnailFetchUrl(null)).toBe(null);
    expect(legacyTradeFeedThumbnailFetchUrl(null)).toBe(null);
  });
});
