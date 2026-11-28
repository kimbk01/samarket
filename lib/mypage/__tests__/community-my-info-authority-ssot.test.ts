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
      "community-friends-manage",
      "reports",
    ]);
  });

  it("My 관심이웃 reads neighbor_follow via the shared list function; user_favorites is gone (구조 확인)", () => {
    const relations = read("app/api/me/relations/[type]/route.ts");
    expect(relations).toContain('type === "neighbor"');
    expect(relations).toContain("listNeighborFollowRows");
    expect(relations).toContain('source: "user_relationships.neighbor_follow"');
    expect(relations).not.toContain("user_favorites");

    const communityTab = read("components/mypage/tabs/CommunityTab.tsx");
    expect(communityTab).toContain("NeighborFollowScreen");
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

  it("neighbor add/remove = one state-set POST (detail·profile·My 관리 공통), no DELETE path (구조 확인)", () => {
    const relations = read("app/api/me/relations/[type]/route.ts");
    const detail = read("app/api/community/neighbor-relations/route.ts");
    /** 추가·해제 = DB 함수 한 번(상한·차단·탈퇴를 한 트랜잭션 — 전체 수정 설계 v2 §5-2) */
    expect(detail).toContain('rpc("neighbor_follow_set_for"');
    expect(detail).toContain("following_required");
    expect(relations).not.toMatch(/type === "neighbor"[\s\S]*\.delete\(\)/);
    const store = read("lib/community/neighbor-follow-store.ts");
    expect(store).toContain("JSON.stringify({ targetUserId: k, following })");
  });
});
