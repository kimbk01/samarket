import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MYPAGE_MOBILE_NAV } from "@/lib/mypage/mypage-mobile-nav-registry";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("CUT1 Community My Info authority SSOT", () => {
  it("nav exposes separate 관심이웃 / 공감 / 저장 entries", () => {
    const community = MYPAGE_MOBILE_NAV.find((s) => s.id === "community");
    expect(community?.items.map((i) => i.id)).toEqual([
      "posts",
      "comments",
      "liked-posts",
      "favorite-posts",
      "community-friends",
      "reports",
    ]);
  });

  it("My 관심이웃 reads neighbor_follow and does not use user_favorites", () => {
    const relations = read("app/api/me/relations/[type]/route.ts");
    expect(relations).toContain('type === "neighbor"');
    expect(relations).toContain("neighbor_follow");
    expect(relations).toContain('source: "user_relationships.neighbor_follow"');
    const neighborBlock = relations.slice(
      relations.indexOf('if (type === "neighbor")'),
      relations.indexOf('const { table, column } = LEGACY_RELATION_CONFIG.favorite')
    );
    expect(neighborBlock).toContain("user_relationships");
    expect(neighborBlock).not.toContain("user_favorites");

    const communityTab = read("components/mypage/tabs/CommunityTab.tsx");
    expect(communityTab).toContain('type="neighbor"');
    expect(communityTab).not.toContain('type="favorite"');
  });

  it("activity loader keeps likes and saves independent (no saves-or-likes)", () => {
    const loader = read("lib/mypage/community-activity-load-server.ts");
    expect(loader).toContain('from("community_post_likes")');
    expect(loader).toContain('from("community_post_saves")');
    expect(loader).not.toMatch(/saveRows\.length\s*>\s*0\s*\?\s*saveRows\s*:\s*likeRows/);
    expect(loader).toContain("likedPosts");
    expect(loader).toContain("savedPosts");
    expect(loader).toContain("reactions: likedPosts");

    const api = read("app/api/me/community-activity/route.ts");
    expect(api).toContain("likedPosts: data.likedPosts");
    expect(api).toContain("savedPosts: data.savedPosts");
    expect(api).toContain("favoritePosts: data.savedPosts");
    expect(api).toContain("reactions: data.likedPosts");
  });

  it("CommunityTab modes bind liked→likes and favorites→saves with unsave writer", () => {
    const tab = read("components/mypage/tabs/CommunityTab.tsx");
    expect(tab).toContain('mode="liked"');
    expect(tab).toContain('mode="favorites"');
    expect(tab).toContain("setLikedPosts");
    expect(tab).toContain("setSavedPosts");
    expect(tab).toContain("/api/community/posts/");
    expect(tab).toContain("/save");
    expect(tab).toContain("philifePostLikeUrl");
    expect(tab).toContain("unlikePost");
  });

  it("neighbor remove uses the same user_relationships authority as detail CTA", () => {
    const relations = read("app/api/me/relations/[type]/route.ts");
    const detail = read("app/api/community/neighbor-relations/route.ts");
    expect(detail).toContain('from("user_relationships")');
    expect(detail).toContain("neighbor_follow");
    expect(relations).toContain('from("user_relationships")');
    expect(relations).toMatch(/type === "neighbor"[\s\S]*\.delete\(\)/);
  });

  it("user_favorites remains only for legacy favorite relation type", () => {
    const relations = read("app/api/me/relations/[type]/route.ts");
    expect(relations).toContain('favorite: { table: "user_favorites"');
    expect(relations).toMatch(/LEGACY_RELATION_CONFIG[\s\S]*user_favorites/);
    const communityTab = read("components/mypage/tabs/CommunityTab.tsx");
    expect(communityTab).not.toContain("user_favorites");
  });
});
