import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase, type FakeDb } from "@/lib/mypage/__tests__/helpers/fake-postgrest";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";

/** S20 A1 · S22 A2 · S24 A3 — 무인자 응답 불변 + 페이지 모드 */
let db: FakeDb = {};
let failTables: string[] = [];

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () => ({ ok: true, userId: "u1" }),
}));
vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({
  getOptionalAuthenticatedUserId: async () => "u1",
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => createFakeSupabase(db, { failTables }),
}));
vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => createFakeSupabase(db, { failTables }),
}));

function req(url: string) {
  return new NextRequest(new URL(url, "http://localhost"));
}

function post(id: string, i: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: id,
    content: "",
    price: 1,
    status: "active",
    seller_listing_state: null,
    images: [],
    thumbnail_url: null,
    view_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: `2026-10-${String(10 + i).padStart(2, "0")}T00:00:00Z`,
    user_id: "u1",
    /** 운영 스키마: owner_state NOT NULL DEFAULT 'none' */
    owner_state: "none",
    region: "",
    city: "",
    ...extra,
  };
}

beforeEach(() => {
  failTables = [];
  db = {
    [POSTS_TABLE_READ]: [post("a", 1), post("b", 2, { status: "hidden" }), post("c", 3)],
    point_promotion_orders: [],
  };
});

describe("GET /api/my/posts (A1, X23)", () => {
  it("무인자 = 현행 `{ posts }` 그대로(next_cursor 없음, 숨김 포함 전체)", async () => {
    const { GET } = await import("@/app/api/my/posts/route");
    const res = await GET(req("/api/my/posts"));
    const json = await res.json();
    expect(Object.keys(json)).toEqual(["posts"]);
    expect(json.posts.map((p: { id: string }) => p.id)).toEqual(["c", "b", "a"]);
    expect(json.posts[0]).toEqual(
      expect.objectContaining({ id: "c", title: "c", status: "active", sellerId: "u1", likesCount: 0, isBoosted: false })
    );
  });

  it("limit 있으면 페이지 모드 `{ posts, next_cursor }` + 필터 술어", async () => {
    const { GET } = await import("@/app/api/my/posts/route");
    const r1 = await (await GET(req("/api/my/posts?limit=1&filter=all"))).json();
    expect(r1.posts.map((p: { id: string }) => p.id)).toEqual(["c"]);
    expect(r1.next_cursor).toBe("2026-10-13T00:00:00Z|c");
    const r2 = await (await GET(req(`/api/my/posts?limit=1&filter=all&cursor=${encodeURIComponent(r1.next_cursor)}`))).json();
    expect(r2.posts.map((p: { id: string }) => p.id)).toEqual(["a"]);
    expect(r2.next_cursor).toBeNull();
    const hidden = await (await GET(req("/api/my/posts?limit=20&filter=hidden"))).json();
    expect(hidden.posts.map((p: { id: string }) => p.id)).toEqual(["b"]);
  });

  it("페이지 모드 실패 = 500 `my_posts_load_failed` (오류 원문 노출 없음)", async () => {
    failTables = [POSTS_TABLE_READ];
    const { GET } = await import("@/app/api/my/posts/route");
    const res = await GET(req("/api/my/posts?limit=20"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "my_posts_load_failed" });
  });

  it("잘못된 커서 = 400", async () => {
    const { GET } = await import("@/app/api/my/posts/route");
    expect((await GET(req("/api/my/posts?limit=20&cursor=bad"))).status).toBe(400);
  });
});

describe("GET /api/favorites/list (A2)", () => {
  beforeEach(() => {
    db = {
      [POSTS_TABLE_READ]: [
        post("p1", 1),
        post("p2", 2, { status: "sold" }),
        post("p3", 3, { status: "hidden" }),
        post("p4", 4),
      ],
      favorites: [
        { id: "f1", user_id: "u1", post_id: "p1", created_at: "2026-10-01T00:00:00Z" },
        { id: "f2", user_id: "u1", post_id: "p2", created_at: "2026-10-02T00:00:00Z" },
        { id: "f3", user_id: "u1", post_id: "p3", created_at: "2026-10-03T00:00:00Z" },
        { id: "f4", user_id: "u1", post_id: "p4", created_at: "2026-10-04T00:00:00Z" },
        { id: "f5", user_id: "u1", post_id: "gone-hard", created_at: "2026-10-05T00:00:00Z" },
        { id: "f9", user_id: "u2", post_id: "p1", created_at: "2026-10-06T00:00:00Z" },
      ],
    };
  });

  it("무인자 = 현행 `{ items, authenticated }` (next_cursor·counts 없음)", async () => {
    const { GET } = await import("@/app/api/favorites/list/route");
    const json = await (await GET()).json();
    expect(Object.keys(json).sort()).toEqual(["authenticated", "items"]);
    expect(json.items.map((x: { id: string }) => x.id)).toEqual(["p4", "p3", "p2", "p1"]);
  });

  it("페이지 + 칩 + counts(서버 전체 기준, 하드 삭제 글 제외)", async () => {
    const { GET } = await import("@/app/api/favorites/list/route");
    const p1 = await (await GET(req("/api/favorites/list?limit=2&chip=all&counts=1"))).json();
    expect(p1.items.map((x: { id: string }) => x.id)).toEqual(["p4", "p3"]);
    expect(p1.counts).toEqual({ all: 4, active: 2, sold: 1, gone: 1 });
    expect(p1.next_cursor).toBe("2026-10-03T00:00:00Z|f3");
    const p2 = await (await GET(req(`/api/favorites/list?limit=2&chip=all&cursor=${encodeURIComponent(p1.next_cursor)}&counts=1`))).json();
    expect(p2.items.map((x: { id: string }) => x.id)).toEqual(["p2", "p1"]);
    expect(p2.counts).toBeUndefined();
    expect(p2.next_cursor).toBeNull();
    const active = await (await GET(req("/api/favorites/list?limit=20&chip=active"))).json();
    expect(active.items.map((x: { id: string }) => x.id)).toEqual(["p4", "p1"]);
    const gone = await (await GET(req("/api/favorites/list?limit=20&chip=gone"))).json();
    expect(gone.items.map((x: { id: string }) => x.id)).toEqual(["p3"]);
  });

  it("DB 오류 = 500 (빈 목록 성공 아님)", async () => {
    failTables = ["favorites"];
    const { GET } = await import("@/app/api/favorites/list/route");
    expect((await GET(req("/api/favorites/list?limit=20"))).status).toBe(500);
  });
});

describe("GET /api/my/received-reviews · written-reviews (A3)", () => {
  beforeEach(() => {
    db = {
      [POSTS_TABLE_READ]: [],
      profiles: [],
      test_users: [],
      transaction_reviews: Array.from({ length: 5 }, (_, i) => ({
        id: `r${i}`,
        product_id: `p${i}`,
        room_id: null,
        reviewer_id: i % 2 ? "u1" : "u9",
        reviewee_id: i % 2 ? "u9" : "u1",
        role_type: "buyer_to_seller",
        public_review_type: "good",
        positive_tag_keys: [],
        negative_tag_keys: [],
        review_comment: "",
        is_anonymous_negative: false,
        created_at: `2026-10-0${i + 1}T00:00:00Z`,
      })),
    };
  });

  it("받은 후기 API 는 닫힘 — 410, 후기 데이터·작성자 정보를 내려주지 않음 (거래 계획 1단계 H-1)", async () => {
    const { GET } = await import("@/app/api/my/received-reviews/route");
    const res = await GET();
    expect(res.status).toBe(410);
    const json = await res.json();
    expect(json).toEqual({ error: "reviews_removed" });
  });

  it("보낸 후기 API 도 닫힘 — 410 (거래 후기 없음, Owner 2026-10-28)", async () => {
    const { GET } = await import("@/app/api/my/written-reviews/route");
    const res = await GET();
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "reviews_removed" });
  });
});
