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
  it("defaults to all + latest (global list)", () => {
    expect(defaultCommunityNavSelection()).toEqual({
      kind: "all",
      topicSlug: "",
      allSort: "latest",
    });
    expect(parseCommunityNavFromSearchParams(new URLSearchParams(""))).toEqual({
      kind: "all",
      topicSlug: "",
      allSort: "latest",
    });
  });

  it("maps all sorts; absorbs legacy home/popular into all", () => {
    expect(parseCommunityNavFromSearchParams(new URLSearchParams("nav=all"))).toEqual({
      kind: "all",
      topicSlug: "",
      allSort: "latest",
    });
    expect(parseCommunityNavFromSearchParams(new URLSearchParams("nav=all&sort=popular"))).toEqual({
      kind: "all",
      topicSlug: "",
      allSort: "popular",
    });
    expect(parseCommunityNavFromSearchParams(new URLSearchParams("sort=latest"))).toEqual({
      kind: "all",
      topicSlug: "",
      allSort: "latest",
    });
    expect(parseCommunityNavFromSearchParams(new URLSearchParams("nav=local"))).toEqual({
      kind: "local",
      topicSlug: "",
      allSort: "latest",
    });
    expect(parseCommunityNavFromSearchParams(new URLSearchParams("nav=popular"))).toEqual({
      kind: "all",
      topicSlug: "",
      allSort: "popular",
    });
    expect(parseCommunityNavFromSearchParams(new URLSearchParams("sort=popular"))).toEqual({
      kind: "all",
      topicSlug: "",
      allSort: "popular",
    });
    expect(parseCommunityNavFromSearchParams(new URLSearchParams("nav=home"))).toEqual({
      kind: "all",
      topicSlug: "",
      allSort: "latest",
    });
    expect(parseCommunityNavFromSearchParams(new URLSearchParams("sort=recommended"))).toEqual({
      kind: "all",
      topicSlug: "",
      allSort: "latest",
    });
  });

  it("topic category wins over all sort", () => {
    expect(
      parseCommunityNavFromSearchParams(new URLSearchParams("category=daily&sort=latest"))
    ).toEqual({
      kind: "topic",
      topicSlug: "daily",
      allSort: "latest",
    });
  });

  it("plans feed query with separated authorities", () => {
    expect(communityNavToFeedQuery({ kind: "home", topicSlug: "", allSort: "latest" })).toEqual({
      feedSort: "latest",
      category: "",
      globalFeed: true,
      requiresRegion: false,
    });
    expect(communityNavToFeedQuery({ kind: "all", topicSlug: "", allSort: "latest" })).toEqual({
      feedSort: "latest",
      category: "",
      globalFeed: true,
      requiresRegion: false,
    });
    expect(communityNavToFeedQuery({ kind: "all", topicSlug: "", allSort: "popular" })).toEqual({
      feedSort: "popular",
      category: "",
      globalFeed: true,
      requiresRegion: false,
    });
    expect(communityNavToFeedQuery({ kind: "local", topicSlug: "", allSort: "latest" })).toEqual({
      feedSort: "latest",
      category: "",
      globalFeed: false,
      requiresRegion: true,
    });
    expect(communityNavToFeedQuery({ kind: "popular", topicSlug: "", allSort: "latest" })).toEqual({
      feedSort: "popular",
      category: "",
      globalFeed: true,
      requiresRegion: false,
    });
  });

  it("builds URL with nav/category/sort separated", () => {
    expect(
      buildCommunityFeedSearchParams({
        selection: { kind: "home", topicSlug: "", allSort: "latest" },
      }).toString()
    ).toBe("nav=all&sort=latest");
    expect(
      buildCommunityFeedSearchParams({
        selection: { kind: "all", topicSlug: "", allSort: "popular" },
      }).toString()
    ).toBe("nav=all&sort=popular");
    expect(
      buildCommunityFeedSearchParams({
        selection: { kind: "all", topicSlug: "", allSort: "latest" },
      }).toString()
    ).toBe("nav=all&sort=latest");
    expect(
      buildCommunityFeedSearchParams({
        selection: { kind: "topic", topicSlug: "daily", allSort: "latest" },
      }).toString()
    ).toBe("category=daily");
    expect(
      buildCommunityFeedHref("/philife", {
        selection: { kind: "local", topicSlug: "", allSort: "latest" },
      })
    ).toBe("/philife?nav=local");
  });

  it("composes topics + Local only (Latest|Popular are UI-fixed)", () => {
    const items = composeCommunityNavItems([
      { slug: "daily", label: "일상", name_en: "Daily", is_feed_sort: false, sort_slot: null },
      { slug: "", label: "", is_feed_sort: false, sort_slot: null },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["topic", "local"]);
  });
});
