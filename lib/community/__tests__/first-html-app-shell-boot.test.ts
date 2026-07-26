import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../../..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("first-html + single snapshot boot", () => {
  it("CommunityHomeSurface owns CommunityUiScope for First HTML", () => {
    const surface = read("components/community/CommunityHomeSurface.tsx");
    expect(surface).toContain("CommunityUiScope");
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
});
