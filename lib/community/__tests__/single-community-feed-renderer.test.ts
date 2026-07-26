import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../../..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("single community feed renderer (attachment 2)", () => {
  it("CommunityHomeSurface owns CommunityUiScope (not client entry)", () => {
    expect(read("components/community/CommunityHomeSurface.tsx")).toContain("CommunityUiScope");
    expect(read("components/community/PhilifeFeedClientEntry.tsx")).not.toContain("CommunityUiScope");
  });

  it("canonical card class uses scoped --cm-radius-card", () => {
    const classes = read("lib/community/community-ui-classes.ts");
    expect(classes).toContain("rounded-[var(--cm-radius-card)]");
    const tokens = read("lib/community/community-design-tokens.css");
    expect(tokens).toContain("--cm-radius-card: 22px");
    expect(tokens).toContain("[data-community-ui]");
  });

  it("CommunityFeed cache path does not select a second card component", () => {
    const feed = read("components/community/CommunityFeed.tsx");
    expect(feed).toContain("CommunityCard");
    expect(feed).not.toMatch(/CachedPostCard|SnapshotPostRow|LegacyPostCard|borderedCard/);
    expect(feed).toContain('data-community-renderer="canonical-v1"');
  });

  it("/ and /philife layouts share CommunityUiScope", () => {
    expect(read("app/(main)/philife/layout.tsx")).toContain("CommunityUiScope");
    expect(read("app/(main)/community/layout.tsx")).toContain("CommunityUiScope");
    expect(read("app/(main)/page.tsx")).toContain("CommunityHomeSurface");
    expect(read("app/(main)/philife/page.tsx")).toContain("CommunityHomeSurface");
  });
});
