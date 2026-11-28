/**
 * 댓글 목록 조회 — 감사 L5·L10·L12·L14 동작 시험 (Supabase 대역).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let commentRows: Record<string, unknown>[] = [];
let commentError: { message: string } | null = null;
let profileRows: Record<string, unknown>[] = [];
let blocks = { blockedByMe: new Set<string>(), blockedMe: new Set<string>() };
let blockReads = 0;

function chain(result: () => { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "in", "neq", "maybeSingle"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => void) => resolve(result());
  return c;
}

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: (table: string) =>
      table === "community_comments"
        ? chain(() => ({ data: commentError ? null : commentRows, error: commentError }))
        : chain(() => ({ data: profileRows, error: null })),
  }),
}));
vi.mock("@/lib/social/user-block-ssot", async (orig) => ({
  ...(await orig<typeof import("@/lib/social/user-block-ssot")>()),
  fetchBlockDirectionsForViewerSb: async () => {
    blockReads += 1;
    return blocks;
  },
}));
vi.mock("@/lib/community/comment-likes.query", () => ({
  fetchLikedCommentIdsSetForUser: async () => new Set<string>(["c1"]),
}));
vi.mock("@/lib/chats/resolve-author-nickname", () => ({
  fetchNicknamesForUserIds: async () => new Map<string, string>(),
}));

import { CommunityCommentsLoadError, listCommunityPostComments } from "@/lib/community-feed/queries";

const base = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  post_id: "p1",
  user_id: `u-${id}`,
  parent_id: null,
  content: `본문 ${id}`,
  created_at: "2026-11-28T00:00:00.000Z",
  updated_at: "2026-11-28T00:10:00.000Z",
  edited_at: null,
  pinned_at: null,
  is_deleted: false,
  is_hidden: false,
  status: "active",
  like_count: 1,
  moderated_by: null,
  ...over,
});

beforeEach(() => {
  commentRows = [];
  commentError = null;
  profileRows = [];
  blocks = { blockedByMe: new Set(), blockedMe: new Set() };
  blockReads = 0;
});

describe("listCommunityPostComments", () => {
  it("L12: 조회 실패는 빈 목록이 아니라 오류", async () => {
    commentError = { message: "boom" };
    await expect(listCommunityPostComments("p1", "viewer")).rejects.toBeInstanceOf(CommunityCommentsLoadError);
  });

  it("L5: 「수정됨」은 edited_at 만 — 관리자 처리로 바뀐 updated_at 은 무시", async () => {
    commentRows = [base("c1", { moderated_by: "admin" }), base("c2", { edited_at: "2026-11-28T00:05:00.000Z" })];
    const { comments } = await listCommunityPostComments("p1", "viewer");
    expect(comments.find((c) => c.id === "c1")?.is_edited).toBe(false);
    expect(comments.find((c) => c.id === "c2")?.is_edited).toBe(true);
  });

  it("L14: 프로필 없는 작성자 이름은 빈 값(화면 「익명」) — 아이디 조각을 쓰지 않는다 · 작성자·고정·사진", async () => {
    commentRows = [base("c1", { pinned_at: "2026-11-28T01:00:00.000Z" }), base("c2")];
    profileRows = [{ id: "u-c1", nickname: "민지", avatar_url: "https://x/a.webp" }];
    const { comments, count } = await listCommunityPostComments("p1", "viewer", { postAuthorUserId: "u-c1" });
    expect(count).toBe(2);
    const c1 = comments.find((c) => c.id === "c1")!;
    expect(c1).toMatchObject({ author_name: "민지", author_avatar_url: "https://x/a.webp", is_post_author: true, is_pinned: true, liked_by_viewer: true });
    const c2 = comments.find((c) => c.id === "c2")!;
    expect(c2.author_name).toBe("");
    expect(c2.author_name).not.toContain("u-c2".slice(0, 8));
  });

  it("L10: 차단한 사람 댓글은 자리만, 다른 사람 답글은 그대로 · 자리 행은 본문·작성자 없음", async () => {
    commentRows = [base("x"), base("y", { parent_id: "x" })];
    blocks = { blockedByMe: new Set(["u-x"]), blockedMe: new Set() };
    const { comments, count } = await listCommunityPostComments("p1", "viewer");
    expect(count).toBe(2);
    expect(comments.map((c) => [c.id, c.display_state])).toEqual([
      ["x", "blocked_author"],
      ["y", "visible"],
    ]);
    expect(comments[0]).toMatchObject({ content: "", user_id: "", author_name: "", like_count: 0 });
  });

  it("C3: 라우트가 이미 읽은 차단 방향을 넘기면 다시 읽지 않는다 (한 요청 1회)", async () => {
    commentRows = [base("x"), base("y", { parent_id: "x" })];
    const handed = { blockedByMe: new Set(["u-x"]), blockedMe: new Set<string>() };
    const { comments } = await listCommunityPostComments("p1", "viewer", { blocks: handed });
    expect(blockReads).toBe(0);
    expect(comments[0]?.display_state).toBe("blocked_author");
    await listCommunityPostComments("p1", "viewer");
    expect(blockReads).toBe(1);
  });
});
