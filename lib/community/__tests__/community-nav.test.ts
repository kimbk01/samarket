import { describe, expect, it } from "vitest";
import {
  buildCommunityFeedHref,
  buildCommunityFeedSearchParams,
  communityNavToFeedQuery,
  composeCommunityNavItems,
  defaultCommunityNavSelection,
  parseCommunityNavFromSearchParams,
} from "@/lib/community/community-nav";

describe("community-nav", () => {
  it("defaults to home + recommended", () => {
    expect(defaultCommunityNavSelection()).toEqual({
      kind: "home",
      topicSlug: "",
      homeSort: "recommended",
    });
    expect(parseCommunityNavFromSearchParams(new URLSearchParams(""))).toEqual({
      kind: "home",
      topicSlug: "",
      homeSort: "recommended",
    });
  });

  it("maps home sorts and popular/local nav", () => {
    expect(parseCommunityNavFromSearchParams(new URLSearchParams("sort=latest"))).toEqual({
      kind: "home",
      topicSlug: "",
      homeSort: "latest",
    });
    expect(parseCommunityNavFromSearchParams(new URLSearchParams("nav=local"))).toEqual({
      kind: "local",
      topicSlug: "",
      homeSort: "recommended",
    });
    expect(parseCommunityNavFromSearchParams(new URLSearchParams("nav=popular"))).toEqual({
      kind: "popular",
      topicSlug: "",
      homeSort: "recommended",
    });
    expect(parseCommunityNavFromSearchParams(new URLSearchParams("sort=popular"))).toEqual({
      kind: "popular",
      topicSlug: "",
      homeSort: "recommended",
    });
  });

  it("topic category wins over home sort", () => {
    expect(
      parseCommunityNavFromSearchParams(new URLSearchParams("category=daily&sort=latest"))
    ).toEqual({
      kind: "topic",
      topicSlug: "daily",
      homeSort: "recommended",
    });
  });

  it("plans feed query with separated authorities", () => {
    expect(communityNavToFeedQuery({ kind: "home", topicSlug: "", homeSort: "recommended" })).toEqual(
      {
        feedSort: "recommended",
        category: "",
        globalFeed: true,
        requiresRegion: false,
      }
    );
    expect(communityNavToFeedQuery({ kind: "local", topicSlug: "", homeSort: "recommended" })).toEqual(
      {
        feedSort: "latest",
        category: "",
        globalFeed: false,
        requiresRegion: true,
      }
    );
    expect(communityNavToFeedQuery({ kind: "popular", topicSlug: "", homeSort: "recommended" })).toEqual(
      {
        feedSort: "popular",
        category: "",
        globalFeed: true,
        requiresRegion: false,
      }
    );
  });

  it("builds URL with nav/category/sort separated", () => {
    expect(
      buildCommunityFeedSearchParams({
        selection: { kind: "home", topicSlug: "", homeSort: "recommended" },
      }).toString()
    ).toBe("sort=recommended");
    expect(
      buildCommunityFeedSearchParams({
        selection: { kind: "topic", topicSlug: "daily", homeSort: "recommended" },
      }).toString()
    ).toBe("category=daily");
    expect(
      buildCommunityFeedHref("/philife", {
        selection: { kind: "local", topicSlug: "", homeSort: "recommended" },
      })
    ).toBe("/philife?nav=local");
  });

  it("composes Home + topics + Local + Popular", () => {
    const items = composeCommunityNavItems([
      { slug: "daily", label: "일상", name_en: "Daily", is_feed_sort: false, sort_slot: null },
      { slug: "", label: "", is_feed_sort: false, sort_slot: null },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["home", "topic", "local", "popular"]);
  });
});
