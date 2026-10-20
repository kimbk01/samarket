import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase, type FakeDb } from "@/lib/mypage/__tests__/helpers/fake-postgrest";
import { parseMypageListCursor } from "@/lib/mypage/mypage-list-cursor";
import { communityReportStatusStage } from "@/lib/mypage/community-activity-types";

/** S27 · A5 — 탭별 커서, 신고 2테이블 병합 정렬, 볼 수 없는 글, 무 tab 응답 불변 */
let db: FakeDb = {};
let failTables: string[] = [];
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => createFakeSupabase(db, { failTables }),
}));
vi.mock("@/lib/auth/api-session", () => ({ requireAuthenticatedUserId: async () => ({ ok: true, userId: "u1" }) }));

const ts = (d: number, h = 0) => `2026-10-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00:00Z`;

beforeEach(() => {
  failTables = [];
  db = {
    community_posts: [
      { id: "p1", title: "Visible", region_label: "", status: "active", is_hidden: false, is_deleted: false },
      { id: "p2", title: "Hidden", region_label: "", status: "hidden", is_hidden: true, is_deleted: false },
    ],
    community_comments: [
      { id: "c1", post_id: "p1", user_id: "u1", content: "a", created_at: ts(1), is_deleted: false, is_hidden: false },
      { id: "c2", post_id: "p2", user_id: "u1", content: "b", created_at: ts(2), is_deleted: false, is_hidden: false },
      { id: "c3", post_id: "p1", user_id: "u1", content: "x", created_at: ts(3), is_deleted: true, is_hidden: false },
      { id: "c4", post_id: "p1", user_id: "u2", content: "y", created_at: ts(4), is_deleted: false, is_hidden: false },
    ],
    community_post_likes: [
      { id: "l1", post_id: "p1", user_id: "u1", created_at: ts(1) },
      { id: "l2", post_id: "p2", user_id: "u1", created_at: ts(2) },
      { id: "l3", post_id: "gone", user_id: "u1", created_at: ts(3) },
    ],
    community_post_saves: [],
    community_reports: [
      { id: "r1", user_id: "u1", target_type: "post", target_id: "p1", reason: "spam", status: "open", created_at: ts(1) },
      { id: "r3", user_id: "u1", target_type: "comment", target_id: "c9", reason: "abuse", status: "dismissed", created_at: ts(3) },
      { id: "r5", user_id: "u1", target_type: "post", target_id: "p1", reason: "x", status: "resolved", created_at: ts(5) },
    ],
    community_messenger_reports: [
      { id: "m2", reporter_user_id: "u1", report_type: "room", room_id: "room1", reason_type: "spam", status: "reviewing", created_at: ts(2) },
      { id: "m4", reporter_user_id: "u1", report_type: "message", message_id: "msg", reason_type: "etc", status: "sanctioned", created_at: ts(4) },
    ],
  };
});

describe("loadCommunityActivityTabPageServer (A5)", () => {
  it("댓글: 삭제 댓글·타인 댓글 제외, 숨김 원글 = 볼 수 없는 글", async () => {
    const { loadCommunityActivityTabPageServer } = await import("@/lib/mypage/community-activity-load-server");
    const r = await loadCommunityActivityTabPageServer("u1", { tab: "comments", limit: 20, cursor: null });
    expect(r.items.map((x) => x.id)).toEqual(["c2", "c1"]);
    expect(r.items[0]).toEqual(expect.objectContaining({ postTitle: "", postVisible: false }));
    expect(r.items[1]).toEqual(expect.objectContaining({ postTitle: "Visible", postVisible: true }));
  });

  it("좋아요: 커서 페이지 + 없는 글은 볼 수 없는 글", async () => {
    const { loadCommunityActivityTabPageServer } = await import("@/lib/mypage/community-activity-load-server");
    const p1 = await loadCommunityActivityTabPageServer("u1", { tab: "reactions", limit: 2, cursor: null });
    expect(p1.items.map((x) => x.id)).toEqual(["gone", "p2"]);
    expect(p1.next_cursor).toBe(`${ts(2)}|l2`);
    const p2 = await loadCommunityActivityTabPageServer("u1", {
      tab: "reactions",
      limit: 2,
      cursor: parseMypageListCursor(p1.next_cursor),
    });
    expect(p2.items.map((x) => x.id)).toEqual(["p1"]);
    expect(p2.next_cursor).toBeNull();
  });

  it("신고: 두 테이블 병합 정렬 + 커서로 이어 읽기(중복·누락 없음)", async () => {
    const { loadCommunityActivityTabPageServer } = await import("@/lib/mypage/community-activity-load-server");
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 5; i++) {
      const page = await loadCommunityActivityTabPageServer("u1", { tab: "reports", limit: 2, cursor: parseMypageListCursor(cursor) });
      seen.push(...page.items.map((x) => x.id));
      cursor = page.next_cursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(["r5", "m4", "r3", "m2", "r1"]);
  });

  it("조회 실패는 throw(라우트 500)", async () => {
    failTables = ["community_post_likes"];
    const { loadCommunityActivityTabPageServer } = await import("@/lib/mypage/community-activity-load-server");
    await expect(loadCommunityActivityTabPageServer("u1", { tab: "reactions", limit: 20, cursor: null })).rejects.toThrow();
  });
});

describe("GET /api/me/community-activity", () => {
  it("무 tab = 현행 묶음 응답 키(별칭 favoritePosts/reactions) 불변", async () => {
    const { GET } = await import("@/app/api/me/community-activity/route");
    const json = await (await GET(new NextRequest(new URL("http://localhost/api/me/community-activity")))).json();
    expect(Object.keys(json).sort()).toEqual(
      ["comments", "favoritePosts", "likedPosts", "ok", "reactions", "reports", "savedPosts", "source"].sort()
    );
    expect(json.reactions).toEqual(json.likedPosts);
  });

  it("tab 모드 `{ ok, tab, items, next_cursor }` · 실패 500", async () => {
    const { GET } = await import("@/app/api/me/community-activity/route");
    const json = await (await GET(new NextRequest(new URL("http://localhost/api/me/community-activity?tab=saved")))).json();
    expect(json).toEqual({ ok: true, tab: "saved", items: [], next_cursor: null });
    failTables = ["community_comments"];
    const res = await GET(new NextRequest(new URL("http://localhost/api/me/community-activity?tab=comments")));
    expect(res.status).toBe(500);
  });
});

describe("신고 처리 상태 4단계", () => {
  it("community·messenger 값 매핑", () => {
    expect(["open", "received", "reviewing", "resolved", "sanctioned", "dismissed", "rejected", ""].map(communityReportStatusStage)).toEqual([
      "received",
      "received",
      "reviewing",
      "resolved",
      "resolved",
      "rejected",
      "rejected",
      "received",
    ]);
  });
});
