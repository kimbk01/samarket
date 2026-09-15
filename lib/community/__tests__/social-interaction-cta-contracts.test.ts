import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Community social interaction hashtag + share contracts", () => {
  it("feed honors ?tag= via neighborhood-feed hashtag option", () => {
    const route = read("app/api/community/neighborhood-feed/route.ts");
    expect(route).toContain("normalizeCommunityHashtagQuery");
    expect(route).toContain("hashtag:");
    const queries = read("lib/neighborhood/queries.ts");
    expect(queries).toContain("hashtag?:");
    expect(queries).toContain("communityPostTextMatchesHashtag");
    const clientUrl = read("lib/philife/neighborhood-feed-client-url.ts");
    expect(clientUrl).toContain("p.set(\"tag\"");
    const feed = read("components/community/CommunityFeed.tsx");
    expect(feed).toContain("tagFilter");
    expect(feed).toContain("clearTagFilter");
    expect(feed).toContain("tag: tagFilter");
  });

  it("detail hashtag chips still link to /philife?tag=", () => {
    const tags = read("components/community/post-detail/CommunityPostDetailTags.tsx");
    expect(tags).toContain("/philife?tag=");
  });

  it("share sheet only exposes native + copy (no visible dead Kakao/internal)", () => {
    const sheet = read("components/community/share/CommunityShareSheet.tsx");
    expect(sheet).toContain("community_share_option_native");
    expect(sheet).toContain("community_share_option_copy");
    expect(sheet).not.toContain("community_share_option_kakao");
    expect(sheet).not.toContain("community_share_option_dibay");
    expect(sheet).not.toContain("CommunityShareTargetPicker");
  });
});
