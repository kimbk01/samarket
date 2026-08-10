import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planPhilifeNeighborhoodSectionPatch } from "@/lib/community-feed/plan-philife-neighborhood-section-patch";
import { buildFeedChipsFromPhilifeTopicOptionsJson } from "@/lib/philife/philife-feed-chips-from-topic-options";
import {
  composeCommunityNavItems,
  communityNavToFeedQuery,
  parseCommunityNavFromSearchParams,
} from "@/lib/community/community-nav";

const routeSrc = readFileSync(
  join(__dirname, "../../../app/api/admin/community/philife-neighborhood-section/route.ts"),
  "utf8"
);

describe("show_all_feed_tab PATCH writer isolation", () => {
  it("CASE A: show_all_feed_tab alone is not writable (not persisted)", () => {
    expect(planPhilifeNeighborhoodSectionPatch({ show_all_feed_tab: true })).toEqual({
      ok: false,
      error: "show_all_feed_tab_not_writable",
    });
    expect(planPhilifeNeighborhoodSectionPatch({ show_all_feed_tab: false })).toEqual({
      ok: false,
      error: "show_all_feed_tab_not_writable",
    });
  });

  it("CASE B: reader/payload compatibility — showAllFeedTab still voided, nav unchanged", () => {
    const chips = buildFeedChipsFromPhilifeTopicOptionsJson({
      ok: true,
      showAllFeedTab: false,
      feedChips: [{ slug: "phlifee", name: "필라이프" }],
      writeTopics: [],
    }).chips;
    const nav = composeCommunityNavItems(chips).map((i) => i.kind);
    expect(nav).toEqual(["home", "all", "topic", "local", "popular"]);
    expect(routeSrc).toContain("getPhilifeShowAllFeedTabServer");
    expect(routeSrc).toContain("show_all_feed_tab: show");
  });

  it("CASE C: show_neighbor_only_filter remains writable; mixed body ignores show_all_feed_tab", () => {
    expect(
      planPhilifeNeighborhoodSectionPatch({
        show_neighbor_only_filter: false,
      })
    ).toEqual({
      ok: true,
      write: { show_neighbor_only_filter: false },
      ignoredShowAllFeedTab: false,
    });
    expect(
      planPhilifeNeighborhoodSectionPatch({
        show_all_feed_tab: true,
        show_neighbor_only_filter: true,
      })
    ).toEqual({
      ok: true,
      write: { show_neighbor_only_filter: true },
      ignoredShowAllFeedTab: true,
    });
  });

  it("route PATCH uses planner and never assigns show_all_feed_tab into value_json", () => {
    expect(routeSrc).toContain("planPhilifeNeighborhoodSectionPatch");
    expect(routeSrc).not.toMatch(/value_json\.show_all_feed_tab\s*=/);
    expect(routeSrc).not.toMatch(/show_all_feed_tab:\s*body\.show_all_feed_tab/);
  });

  it("product feed plans unchanged (Home/All/Topic/Local/Popular + allSort)", () => {
    expect(communityNavToFeedQuery(parseCommunityNavFromSearchParams(new URLSearchParams("")))).toMatchObject({
      feedSort: "recommended",
      category: "",
      globalFeed: false,
      requiresRegion: true,
    });
    expect(
      communityNavToFeedQuery(parseCommunityNavFromSearchParams(new URLSearchParams("nav=all&sort=latest")))
    ).toMatchObject({ feedSort: "latest", category: "", globalFeed: true });
    expect(
      communityNavToFeedQuery(parseCommunityNavFromSearchParams(new URLSearchParams("sort=latest")))
    ).toMatchObject({ feedSort: "latest", category: "", globalFeed: true });
    expect(
      communityNavToFeedQuery(parseCommunityNavFromSearchParams(new URLSearchParams("nav=popular")))
    ).toMatchObject({ feedSort: "popular", category: "" });
    expect(
      communityNavToFeedQuery(parseCommunityNavFromSearchParams(new URLSearchParams("nav=local")))
    ).toMatchObject({ requiresRegion: true, globalFeed: false });
    expect(
      communityNavToFeedQuery(parseCommunityNavFromSearchParams(new URLSearchParams("category=phlifee")))
    ).toMatchObject({ category: "phlifee", feedSort: "latest" });
  });
});
