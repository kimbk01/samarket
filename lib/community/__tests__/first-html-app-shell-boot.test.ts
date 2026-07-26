import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isSameCommunityTopicOptionsAuthority,
  resolveCommunityFeedBootSelection,
} from "@/lib/community/resolve-initial-community-feed-snapshot";

const root = join(__dirname, "../../..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("first-html + single snapshot boot", () => {
  it("CommunityHomeSurface owns CommunityUiScope for First HTML", () => {
    const surface = read("components/community/CommunityHomeSurface.tsx");
    expect(surface).toContain("CommunityUiScope");
    expect(surface).not.toMatch(/^\s*["']use client["'];/m);
    expect(read("components/community/PhilifeFeedClientEntry.tsx")).not.toContain("CommunityUiScope");
  });

  it("RegionBar statically imports ExplorationTier1 (no ssr:false)", () => {
    const rb = read("components/layout/RegionBar.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(rb).toContain("import { RegionBarExplorationTier1 }");
    expect(rb).not.toMatch(/ssr:\s*false/);
  });

  it("Cold and Warm share resolveInitialCommunityFeedSnapshot", () => {
    expect(read("lib/community/resolve-initial-community-feed-snapshot.ts")).toContain(
      "export function resolveInitialCommunityFeedSnapshot"
    );
    expect(read("components/community/PhilifeFeedClientEntry.tsx")).toContain(
      "resolveInitialCommunityFeedSnapshot"
    );
    expect(read("components/community/CommunityFeed.tsx")).toContain(
      "resolveInitialCommunityFeedSnapshot"
    );
  });

  it("network refresh patches from prev, not from empty merge", () => {
    const feed = read("components/community/CommunityFeed.tsx");
    expect(feed).toContain("patchNeighborhoodFeedRows(prev, next)");
    expect(feed).not.toMatch(/mergeNeighborhoodFeedById\(\s*\[\s*\]\s*,\s*next/);
  });

  it("does not guess the all-feed cache before topic authority is known", () => {
    expect(resolveCommunityFeedBootSelection("", null)).toEqual({
      category: "",
      authorityReady: false,
    });
  });

  it("uses the first visible topic when the all tab is disabled", () => {
    expect(
      resolveCommunityFeedBootSelection("", {
        ok: true,
        showAllFeedTab: false,
        feedChips: [
          {
            slug: "recommended",
            name: "추천",
            is_feed_sort: true,
            sort_slot: "recommend",
          },
          { slug: "philippines", name: "필리핀생활" },
          { slug: "daily", name: "일상생활" },
        ],
        writeTopics: [],
      })
    ).toEqual({
      category: "philippines",
      authorityReady: true,
    });
  });

  it("keeps an explicit URL category as the feed authority", () => {
    expect(
      resolveCommunityFeedBootSelection("daily", {
        ok: true,
        showAllFeedTab: false,
        feedChips: [{ slug: "philippines", name: "필리핀생활" }],
        writeTopics: [],
      })
    ).toEqual({
      category: "daily",
      authorityReady: true,
    });
  });

  it("treats same topic authority payload as equal even with new object identity", () => {
    const a = {
      ok: true,
      showAllFeedTab: false,
      feedChips: [{ slug: "philippines", name: "필리핀생활" }],
      writeTopics: [],
    };
    const b = {
      ok: true,
      showAllFeedTab: false,
      feedChips: [{ slug: "philippines", name: "필리핀생활" }],
      writeTopics: [],
    };
    expect(isSameCommunityTopicOptionsAuthority(a, b)).toBe(true);
    expect(
      isSameCommunityTopicOptionsAuthority(a, {
        ...b,
        feedChips: [{ slug: "daily", name: "일상생활" }],
      })
    ).toBe(false);
  });
});
