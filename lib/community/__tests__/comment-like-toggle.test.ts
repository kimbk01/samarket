import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd());

describe("comment like toggle contract", () => {
  it("server toggles via community_comment_likes row existence", () => {
    const src = readFileSync(join(root, "lib/community/comment-mutations.server.ts"), "utf8");
    expect(src).toContain('from("community_comment_likes")');
    expect(src).toContain("liked: false");
    expect(src).toContain("liked: true");
    expect(src).toMatch(/if \(ex\)[\s\S]*delete/);
    expect(src).toMatch(/insert\(\{ comment_id: cid, user_id: uid \}\)/);
    expect(src).toContain('String(insE.code) === "23505"');
  });

  it("usePhilifePostComments toggles optimistically and uses server liked flag", () => {
    const src = readFileSync(join(root, "hooks/use-philife-post-comments.ts"), "utf8");
    expect(src).toContain("likeInflightRef");
    expect(src).toContain("const nextLiked = !node.liked_by_viewer");
    expect(src).toContain("typeof data.liked === \"boolean\"");
    expect(src).toContain("await reloadComments()");
    expect(src).toContain("setFocusCommentId(createdId)");
  });

  it("CommunityDetail post like toggles with server liked flag", () => {
    const src = readFileSync(join(root, "components/community/CommunityDetail.tsx"), "utf8");
    expect(src).toContain("const nextLiked = !prevLiked");
    expect(src).toContain("typeof data.liked === \"boolean\"");
  });

  it("post like API toggles community_post_likes", () => {
    const src = readFileSync(join(root, "app/api/community/posts/[postId]/like/route.ts"), "utf8");
    expect(src).toContain('from("community_post_likes")');
    expect(src).toContain("const liked = !ex");
  });
});
