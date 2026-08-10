import { describe, expect, it } from "vitest";
import type { CommunityTopicDTO } from "@/lib/community-feed/types";
import { resolveNeighborhoodListSort } from "@/lib/neighborhood/philife-neighborhood-feed-sort";

function topic(
  partial: Pick<CommunityTopicDTO, "slug" | "is_feed_sort" | "feed_sort_mode"> &
    Partial<CommunityTopicDTO>
): CommunityTopicDTO {
  return {
    id: "t1",
    section_id: "s1",
    name: partial.slug,
    name_en: null,
    color: null,
    icon: null,
    sort_order: 0,
    is_visible: true,
    allow_question: false,
    allow_meetup: false,
    feed_list_skin: "compact_media",
    ...partial,
  };
}

describe("resolveNeighborhoodListSort hardening", () => {
  it("TEST1: contaminated content phlifee stays topic filter", () => {
    const r = resolveNeighborhoodListSort("phlifee", "latest", [
      topic({ slug: "phlifee", is_feed_sort: true, feed_sort_mode: "popular" }),
    ]);
    expect(r).toEqual({
      filterCategory: "phlifee",
      feedSort: "latest",
      isSortOnlyTopicChip: false,
    });
  });

  it("TEST2: contaminated content travel stays topic filter", () => {
    const r = resolveNeighborhoodListSort("travel", "latest", [
      topic({ slug: "travel", is_feed_sort: true, feed_sort_mode: "popular" }),
    ]);
    expect(r).toEqual({
      filterCategory: "travel",
      feedSort: "latest",
      isSortOnlyTopicChip: false,
    });
  });

  it("TEST3: recommended sort-slot stays sort-only", () => {
    const r = resolveNeighborhoodListSort("recommended", "latest", [
      topic({ slug: "recommended", is_feed_sort: true, feed_sort_mode: "recommended" }),
    ]);
    expect(r).toEqual({
      filterCategory: null,
      feedSort: "latest",
      isSortOnlyTopicChip: true,
    });
  });

  it("TEST4: popular sort-slot stays sort-only", () => {
    const r = resolveNeighborhoodListSort("popular", "latest", [
      topic({ slug: "popular", is_feed_sort: true, feed_sort_mode: "popular" }),
    ]);
    expect(r).toEqual({
      filterCategory: null,
      feedSort: "popular",
      isSortOnlyTopicChip: true,
    });
  });

  it("TEST5: unknown flagged slug is not sort-only", () => {
    const r = resolveNeighborhoodListSort("unknown", "latest", [
      topic({ slug: "unknown", is_feed_sort: true, feed_sort_mode: "popular" }),
    ]);
    expect(r).toEqual({
      filterCategory: "unknown",
      feedSort: "latest",
      isSortOnlyTopicChip: false,
    });
  });

  it("clean content topic: topic filter", () => {
    const r = resolveNeighborhoodListSort("phlifee", "recommended", [
      topic({ slug: "phlifee", is_feed_sort: false, feed_sort_mode: null }),
    ]);
    expect(r).toEqual({
      filterCategory: "phlifee",
      feedSort: "recommended",
      isSortOnlyTopicChip: false,
    });
  });

  it("empty category: home-style sort passthrough", () => {
    expect(resolveNeighborhoodListSort("", "recommended", [])).toEqual({
      filterCategory: null,
      feedSort: "recommended",
      isSortOnlyTopicChip: false,
    });
    expect(resolveNeighborhoodListSort(null, "popular", [])).toEqual({
      filterCategory: null,
      feedSort: "popular",
      isSortOnlyTopicChip: false,
    });
    expect(resolveNeighborhoodListSort(undefined, "latest", [])).toEqual({
      filterCategory: null,
      feedSort: "latest",
      isSortOnlyTopicChip: false,
    });
  });
});
