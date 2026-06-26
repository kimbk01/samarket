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

function legacyCommunityFeedThumbnailFetchUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return buildFeedThumbnailFetchUrl(raw, COMMUNITY_FEED_THUMB_DISPLAY_PX) ?? raw;
}

function adapterCommunityFeedThumbnailFetchUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return loadCommunityFeedThumbnailFetchUrl(raw) ?? raw;
}

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

  it("post-images — legacy URL equals adapter URL (width=176)", () => {
    const legacy = legacyCommunityFeedThumbnailFetchUrl(POST_RAW);
    const adapter = adapterCommunityFeedThumbnailFetchUrl(POST_RAW);
    expect(adapter).toBe(legacy);
    expect(adapter).toContain("width=176");
    expect(adapter).toContain("height=176");
    expect(adapter).toContain("/render/image/public/post-images/");
  });

  it("external URL — pass-through byte-identical", () => {
    const legacy = legacyCommunityFeedThumbnailFetchUrl(EXTERNAL_RAW);
    const adapter = adapterCommunityFeedThumbnailFetchUrl(EXTERNAL_RAW);
    expect(adapter).toBe(legacy);
    expect(adapter).toBe(EXTERNAL_RAW);
  });

  it("empty input — null", () => {
    expect(adapterCommunityFeedThumbnailFetchUrl(null)).toBe(null);
    expect(legacyCommunityFeedThumbnailFetchUrl(null)).toBe(null);
  });
});
