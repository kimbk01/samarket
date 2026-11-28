import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd());

describe("comment like toggle contract", () => {
  it("구조 확인: 댓글 공감 = 원하는 상태 저장, 수 계산은 DB RPC (감사 L6 · CM-P3-04)", () => {
    const src = readFileSync(join(root, "lib/community/comment-mutations.server.ts"), "utf8");
    expect(src).toContain('rpc("community_comment_like_set"');
    expect(src).toContain("p_liked: liked");
    expect(src).not.toMatch(/update\(\{ like_count: next[01] \}/);
    const route = readFileSync(join(root, "app/api/community/posts/[postId]/comments/[commentId]/like/route.ts"), "utf8");
    expect(route).toContain('typeof liked !== "boolean"');
  });

  it("구조 확인: usePhilifePostComments 낙관 반영 후 서버 값으로 확정", () => {
    const src = readFileSync(join(root, "hooks/use-philife-post-comments.ts"), "utf8");
    expect(src).toContain("likeInflightRef");
    expect(src).toContain("const nextLiked = !node.liked_by_viewer");
    expect(src).toContain("typeof data.liked === \"boolean\"");
    expect(src).toContain("JSON.stringify({ liked: nextLiked })");
    expect(src).toContain("await reloadComments()");
    expect(src).toContain("setFocusCommentId(createdId)");
  });

  it("CommunityDetail post like toggles with server liked flag", () => {
    const src = readFileSync(join(root, "components/community/CommunityDetail.tsx"), "utf8");
    expect(src).toContain("const nextLiked = !prevLiked");
    expect(src).toContain("typeof data.liked === \"boolean\"");
  });

  it("post like API: 원하는 상태(liked) 지정 시 멱등, 미지정 시 토글 (CM-R-08)", () => {
    const src = readFileSync(join(root, "app/api/community/posts/[postId]/like/route.ts"), "utf8");
    expect(src).toContain('from("community_post_likes")');
    expect(src).toContain("const liked = desired ?? !ex");
    expect(src).toContain('code !== "23505"');
  });
});
