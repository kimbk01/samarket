import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  fetchCommunityMyHubPostsDeduped,
  invalidateCommunityMyHubPostsCache,
  resetCommunityMyHubPostsCacheForTests,
} from "@/lib/community/fetch-community-my-hub-posts-deduped";

vi.mock("@/lib/philife/fetch-neighborhood-feed-short-ttl", () => ({
  fetchNeighborhoodFeedShortTtl: vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, posts: [{ id: "post-1", title: "Hello" }] }),
  })),
}));

vi.mock("@/lib/http/run-single-flight", () => ({
  runSingleFlight: (_key: string, factory: () => Promise<unknown>) => factory(),
}));

describe("fetchCommunityMyHubPostsDeduped cache", () => {
  beforeEach(() => {
    resetCommunityMyHubPostsCacheForTests();
    vi.clearAllMocks();
  });

  it("returns cached value within TTL", async () => {
    const uid = "user-cache-1";
    const first = await fetchCommunityMyHubPostsDeduped(uid);
    expect(first.json.posts).toHaveLength(1);

    const { fetchNeighborhoodFeedShortTtl } = await import("@/lib/philife/fetch-neighborhood-feed-short-ttl");
    vi.mocked(fetchNeighborhoodFeedShortTtl).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, posts: [] }),
    } as never);

    const second = await fetchCommunityMyHubPostsDeduped(uid);
    expect(second.json.posts).toHaveLength(1);
    expect(fetchNeighborhoodFeedShortTtl).toHaveBeenCalledTimes(1);
  });

  it("refetches immediately after invalidateCommunityMyHubPostsCache", async () => {
    const uid = "user-cache-2";
    await fetchCommunityMyHubPostsDeduped(uid);

    const { fetchNeighborhoodFeedShortTtl } = await import("@/lib/philife/fetch-neighborhood-feed-short-ttl");
    vi.mocked(fetchNeighborhoodFeedShortTtl).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, posts: [{ id: "post-2", title: "Fresh" }] }),
    } as never);

    invalidateCommunityMyHubPostsCache(uid);
    const after = await fetchCommunityMyHubPostsDeduped(uid);
    expect(after.json.posts?.[0]?.id).toBe("post-2");
    expect(fetchNeighborhoodFeedShortTtl).toHaveBeenCalledTimes(2);
  });
});
