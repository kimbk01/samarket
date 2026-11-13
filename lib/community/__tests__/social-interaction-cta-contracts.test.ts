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
    // FEED 공유는 통합 공유 실행 훅(§N-3)을 쓴다 — 기기 공유 창 바로, 없으면 시트(다른 앱으로 공유 · 링크 복사)
    const feedSheet = read("lib/community/share/use-community-post-share.ts");
    expect(feedSheet).toContain("useDibayShareSheet");
    const sheet = read("components/share/DibayShareSheet.tsx");
    expect(sheet).toContain("share_option_native");
    expect(sheet).toContain("share_option_copy");
    for (const src of [feedSheet, sheet]) {
      expect(src).not.toContain("community_share_option_kakao");
      expect(src).not.toContain("community_share_option_dibay");
      expect(src).not.toContain("CommunityShareTargetPicker");
      expect(src).not.toContain("Kakao");
    }
  });
});
