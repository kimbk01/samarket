import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeDb } from "@/lib/mypage/__tests__/helpers/fake-postgrest";
import { parseMypageListCursor } from "@/lib/mypage/mypage-list-cursor";

/** S26 · A4 — owner 범위(타인 글 0, 삭제 글 0, 숨김 포함), 커서, 실패 = ok:false */
let db: FakeDb = {};
let failTables: string[] = [];
vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => createFakeSupabase(db, { failTables }),
}));
vi.mock("@/lib/chats/resolve-author-nickname", () => ({
  fetchNicknamesForUserIds: vi.fn(async () => new Map([["u1", "Me"]])),
}));

function row(id: string, day: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    user_id: "u1",
    title: `t-${id}`,
    summary: "",
    section_slug: "s",
    topic_slug: "free",
    region_label: "",
    view_count: 0,
    like_count: 2,
    comment_count: 3,
    created_at: `2026-10-${String(day).padStart(2, "0")}T00:00:00Z`,
    status: "active",
    is_hidden: false,
    is_deleted: false,
    origin_kind: null,
    ...extra,
  };
}

beforeEach(() => {
  failTables = [];
  db = {
    community_posts: [
      row("a1", 10),
      row("h1", 11, { status: "hidden" }),
      row("h2", 12, { is_hidden: true }),
      row("d1", 13, { status: "deleted" }),
      row("d2", 14, { is_deleted: true, status: "active" }),
      row("a2", 15, { origin_kind: "imported" }),
      row("x1", 16, { user_id: "u2" }),
      row("a3", 17),
    ],
    community_post_images: [{ post_id: "a3", image_url: "https://img/a3.jpg", sort_order: 0 }],
  };
});

describe("listOwnCommunityPostsPage (A4)", () => {
  it("게시중 = 공개 가시·미숨김, 타인·삭제 제외, total", async () => {
    const { listOwnCommunityPostsPage } = await import("@/lib/community-feed/list-community-posts-for-user");
    const r = await listOwnCommunityPostsPage("u1", { status: "active", limit: 20, cursor: null, withTotal: true });
    if (!r.ok) throw new Error("fail");
    expect(r.posts.map((p) => p.id)).toEqual(["a3", "a2", "a1"]);
    expect(r.total).toBe(3);
    expect(r.posts[0]).toEqual(
      expect.objectContaining({ isHiddenForOwner: false, thumbnail_url: "https://img/a3.jpg", comment_count: 3 })
    );
    expect(r.posts.find((p) => p.id === "a2")?.isImported).toBe(true);
  });

  it("숨김됨 = is_hidden 또는 status hidden (삭제 제외)", async () => {
    const { listOwnCommunityPostsPage } = await import("@/lib/community-feed/list-community-posts-for-user");
    const r = await listOwnCommunityPostsPage("u1", { status: "hidden", limit: 20, cursor: null, withTotal: true });
    if (!r.ok) throw new Error("fail");
    expect(r.posts.map((p) => p.id)).toEqual(["h2", "h1"]);
    expect(r.posts.every((p) => p.isHiddenForOwner)).toBe(true);
    expect(r.total).toBe(2);
  });

  it("커서 페이지", async () => {
    const { listOwnCommunityPostsPage } = await import("@/lib/community-feed/list-community-posts-for-user");
    const p1 = await listOwnCommunityPostsPage("u1", { status: "active", limit: 2, cursor: null });
    if (!p1.ok) throw new Error("fail");
    expect(p1.posts.map((p) => p.id)).toEqual(["a3", "a2"]);
    const p2 = await listOwnCommunityPostsPage("u1", {
      status: "active",
      limit: 2,
      cursor: parseMypageListCursor(p1.next_cursor),
    });
    if (!p2.ok) throw new Error("fail");
    expect(p2.posts.map((p) => p.id)).toEqual(["a1"]);
    expect(p2.next_cursor).toBeNull();
  });

  it("조회 실패 = ok:false (빈 배열 아님)", async () => {
    failTables = ["community_posts"];
    const { listOwnCommunityPostsPage } = await import("@/lib/community-feed/list-community-posts-for-user");
    const r = await listOwnCommunityPostsPage("u1", { status: "active", limit: 20, cursor: null });
    expect(r.ok).toBe(false);
  });
});
