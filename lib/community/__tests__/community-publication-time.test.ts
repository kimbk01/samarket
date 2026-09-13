import { describe, expect, it } from "vitest";
import {
  communityFeedKeysetOrFilter,
  communityPostPublicPublishedAt,
  decodeCommunityFeedCursor,
  encodeCommunityFeedCursor,
} from "@/lib/community/community-publication-time";
import { rankByRecommended } from "@/lib/community-feed/feed-ranking";

describe("community-publication-time", () => {
  it("prefers published_at for public clock", () => {
    expect(
      communityPostPublicPublishedAt({
        published_at: "2024-01-02T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
      })
    ).toBe("2024-01-02T00:00:00.000Z");
  });

  it("falls back to created_at when published_at missing", () => {
    expect(
      communityPostPublicPublishedAt({
        published_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
      })
    ).toBe("2026-01-01T00:00:00.000Z");
  });

  it("round-trips keyset cursor encode/decode", () => {
    const c = { publishedAt: "2024-01-02T00:00:00.000Z", id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" };
    expect(decodeCommunityFeedCursor(encodeCommunityFeedCursor(c))).toEqual(c);
  });

  it("builds PostgREST keyset OR filter", () => {
    expect(
      communityFeedKeysetOrFilter({
        publishedAt: "2024-01-02T00:00:00.000Z",
        id: "id-1",
      })
    ).toBe(
      'published_at.lt."2024-01-02T00:00:00.000Z",and(published_at.eq."2024-01-02T00:00:00.000Z",id.lt."id-1")'
    );
  });
});

describe("feed-ranking age clock", () => {
  it("ages by published_at when present", () => {
    const now = Date.now();
    const olderPub = new Date(now - 10 * 86_400_000).toISOString();
    const newerPub = new Date(now - 1 * 86_400_000).toISOString();
    const ranked = rankByRecommended(
      [
        {
          id: "old",
          like_count: 10,
          comment_count: 0,
          view_count: 0,
          published_at: olderPub,
          created_at: newerPub,
        },
        {
          id: "new",
          like_count: 10,
          comment_count: 0,
          view_count: 0,
          published_at: newerPub,
          created_at: olderPub,
        },
      ],
      2
    );
    expect(ranked[0]?.id).toBe("new");
  });
});
