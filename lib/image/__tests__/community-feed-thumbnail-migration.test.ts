import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFeedThumbnailFetchUrl } from "@/lib/media/feed-thumbnail-transform";
import { COMMUNITY_FEED_THUMB_DISPLAY_PX } from "@/lib/media/feed-thumbnail-display";
import {
  COMMUNITY_FEED_THUMB_DISPLAY_PX as ADAPTER_COMMUNITY_FEED_THUMB_DISPLAY_PX,
  loadCommunityFeedThumbnailFetchUrl,
} from "@/lib/image";

const POST_RAW =
  "https://abc.supabase.co/storage/v1/object/public/post-images/user1/community/item.jpg";
const EXTERNAL_RAW = "https://cdn.imweb.me/photo.jpg";

describe("community feed thumbnail migration (ListThumb SSOT)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("re-exports community feed display px unchanged", () => {
    expect(ADAPTER_COMMUNITY_FEED_THUMB_DISPLAY_PX).toBe(88);
    expect(ADAPTER_COMMUNITY_FEED_THUMB_DISPLAY_PX).toBe(COMMUNITY_FEED_THUMB_DISPLAY_PX);
  });

  it("post-images — Phase 2B thumb derivative (88px display)", () => {
    const adapter = loadCommunityFeedThumbnailFetchUrl(POST_RAW);
    const feed = buildFeedThumbnailFetchUrl(POST_RAW, COMMUNITY_FEED_THUMB_DISPLAY_PX);
    expect(adapter).toBe(feed);
    expect(adapter).toContain(".thumb.webp");
    expect(adapter).not.toContain("/render/image/");
  });

  it("external URL — pass-through", () => {
    expect(loadCommunityFeedThumbnailFetchUrl(EXTERNAL_RAW)).toBe(EXTERNAL_RAW);
  });

  it("empty input — null", () => {
    expect(loadCommunityFeedThumbnailFetchUrl(null)).toBe(null);
  });
});
