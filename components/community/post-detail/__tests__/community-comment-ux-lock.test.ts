import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("community comment UX lock", () => {
  it("does not wire community comment ids to legacy createCommunityCommentReport", () => {
    const item = read("components/community/post-detail/CommunityCommentItem.tsx");
    const section = read("components/community/post-detail/CommunityCommentSection.tsx");
    const detail = read("components/community/CommunityDetail.tsx");
    expect(item).not.toContain("createCommunityCommentReport");
    expect(section).not.toContain("createCommunityCommentReport");
    expect(detail).not.toMatch(/createCommunityCommentReport/);
    expect(item).not.toContain("community_comment_actions_ellipsis");
    expect(item).toContain("community_comment_copy");
    expect(item).toContain("community_comment_more_aria");
  });

  it("keeps like-only and parent_id reply tree", () => {
    const item = read("components/community/post-detail/CommunityCommentItem.tsx");
    const hook = read("hooks/use-philife-post-comments.ts");
    expect(item).toContain("community_stat_likes");
    expect(item).not.toMatch(/dislike|반대/);
    expect(item).toContain("min(depth, MAX_VISUAL_DEPTH) * INDENT_PX");
    expect(item).toContain("const MAX_VISUAL_DEPTH = 2");
    expect(item).toContain("const INDENT_PX = 12");
    expect(hook).toContain("philifePostCommentLikeUrl");
    expect(hook).toContain("parentId");
    expect(hook).toContain("fetchPhilifePostCommentTree");
  });

  it("uses POST comment id for focus and does not scroll to endRef", () => {
    const hook = read("hooks/use-philife-post-comments.ts");
    const section = read("components/community/post-detail/CommunityCommentSection.tsx");
    expect(hook).toContain("data.id");
    expect(hook).toContain("setFocusCommentId(createdId)");
    expect(hook).not.toContain("scrollSig");
    expect(section).not.toContain("scrollToBottomSignal");
    expect(section).not.toContain("endRef");
    expect(section).toContain("comment-${focusCommentId}");
  });

  it("separates loading empty and error list states", () => {
    const section = read("components/community/post-detail/CommunityCommentSection.tsx");
    const hook = read("hooks/use-philife-post-comments.ts");
    expect(section).toContain('listState === "error"');
    expect(section).toContain("community_comments_load_error");
    expect(section).toContain("common_retry");
    expect(section).toContain("community_comment_first");
    expect(hook).toContain("retryComments");
    expect(hook).toContain("setLoadError(true)");
  });

  it("composer uses textarea grow without Enter submit and without nested item cards", () => {
    const composer = read("components/community/post-detail/CommunityCommentComposerForm.tsx");
    const section = read("components/community/post-detail/CommunityCommentSection.tsx");
    expect(composer).toContain("textarea");
    expect(composer).toContain("max-h-[7.5rem]");
    expect(composer).toContain("scrollHeight");
    expect(composer).not.toMatch(/e\.key === \"Enter\"/);
    expect(section).toContain("divide-y divide-[var(--cm-border)]");
    expect(section).not.toContain("rounded-2xl border border-[var(--cm-border)] bg-[var(--cm-page-bg)] p-2");
  });
});
