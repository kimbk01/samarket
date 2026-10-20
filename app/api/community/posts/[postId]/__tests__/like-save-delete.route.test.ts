import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { createFakeSupabase, type FakeDb } from "@/lib/mypage/__tests__/helpers/fake-postgrest";

/** S27 · A6 — 본인 행 삭제는 숨김·삭제 글·차단 관계와 무관하게 200, 행 없음 200, 타인 행 영향 0, POST 불변 */
let db: FakeDb = {};
let failTables: string[] = [];
let authed = true;
const isBlockedEitherWay = vi.fn(async () => true);

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () =>
    authed
      ? { ok: true, userId: "u1" }
      : { ok: false, response: new Response(JSON.stringify({ ok: false }), { status: 401 }) },
}));
vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => createFakeSupabase(db, { failTables }) }));
vi.mock("@/lib/community-feed/queries", () => ({
  // 숨김·삭제 글은 canonical 해석이 null 을 돌려준다(현행 `is_hidden=false` 조건)
  resolveCanonicalCommunityPostId: async (raw: string) =>
    (db.community_posts ?? []).some((p) => p.id === raw && p.is_hidden !== true && p.status === "active") ? raw : null,
}));
vi.mock("@/lib/community-messenger/social-relations", () => ({ isBlockedEitherWay: () => isBlockedEitherWay() }));
vi.mock("@/lib/notifications/community-social-inapp-notify", () => ({ notifyCommunityPostLikeReceived: vi.fn() }));
vi.mock("@/lib/community/community-import-principal", () => ({ loadCommunityImportPrincipalUserId: async () => null }));

const ctx = (postId: string) => ({ params: Promise.resolve({ postId }) });
const req = () => new NextRequest(new URL("http://localhost/x"), { method: "DELETE" });

beforeEach(() => {
  authed = true;
  failTables = [];
  db = {
    community_posts: [
      { id: "hidden-post", user_id: "author", status: "hidden", is_hidden: true },
      { id: "deleted-post", user_id: "author", status: "deleted", is_deleted: true },
      { id: "blocked-author-post", user_id: "blocked", status: "active", is_hidden: false },
    ],
    community_post_likes: [
      { id: "l1", post_id: "hidden-post", user_id: "u1" },
      { id: "l2", post_id: "deleted-post", user_id: "u1" },
      { id: "l3", post_id: "blocked-author-post", user_id: "u1" },
      { id: "l4", post_id: "hidden-post", user_id: "u2" },
    ],
    community_post_saves: [
      { id: "s1", post_id: "hidden-post", user_id: "u1" },
      { id: "s2", post_id: "blocked-author-post", user_id: "u1" },
      { id: "s3", post_id: "blocked-author-post", user_id: "u2" },
    ],
  };
});

describe("DELETE /api/community/posts/[postId]/like", () => {
  it.each(["hidden-post", "deleted-post", "blocked-author-post"])("%s → 200 liked:false, 본인 행만 삭제", async (pid) => {
    const { DELETE } = await import("@/app/api/community/posts/[postId]/like/route");
    const res = await DELETE(req(), ctx(pid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, liked: false });
    expect(db.community_post_likes!.some((r) => r.post_id === pid && r.user_id === "u1")).toBe(false);
    expect(db.community_post_likes!.some((r) => r.user_id === "u2")).toBe(true);
  });
  it("행 없음 → 200 (멱등)", async () => {
    const { DELETE } = await import("@/app/api/community/posts/[postId]/like/route");
    const res = await DELETE(req(), ctx("no-such"));
    expect(res.status).toBe(200);
  });
  it("401 · DB 실패 500", async () => {
    const { DELETE } = await import("@/app/api/community/posts/[postId]/like/route");
    authed = false;
    expect((await DELETE(req(), ctx("hidden-post"))).status).toBe(401);
    authed = true;
    failTables = ["community_post_likes"];
    expect((await DELETE(req(), ctx("hidden-post"))).status).toBe(500);
  });
});

describe("DELETE /api/community/posts/[postId]/save", () => {
  it.each(["hidden-post", "blocked-author-post"])("%s → 200 saved:false, 타인 행 영향 0", async (pid) => {
    const { DELETE } = await import("@/app/api/community/posts/[postId]/save/route");
    const res = await DELETE(req(), ctx(pid));
    expect(await res.json()).toEqual({ ok: true, saved: false });
    expect(db.community_post_saves!.some((r) => r.post_id === pid && r.user_id === "u1")).toBe(false);
    expect(db.community_post_saves!.some((r) => r.id === "s3")).toBe(true);
  });
  it("행 없음 → 200", async () => {
    const { DELETE } = await import("@/app/api/community/posts/[postId]/save/route");
    expect((await DELETE(req(), ctx("deleted-post"))).status).toBe(200);
  });
});

describe("POST 토글 규칙 회귀 0", () => {
  it("숨김 글 POST 는 여전히 404, 차단 관계 POST 는 403", async () => {
    const like = await import("@/app/api/community/posts/[postId]/like/route");
    const save = await import("@/app/api/community/posts/[postId]/save/route");
    const post = () => new NextRequest(new URL("http://localhost/x"), { method: "POST" });
    expect((await like.POST(post(), ctx("hidden-post"))).status).toBe(404);
    expect((await save.POST(post(), ctx("hidden-post"))).status).toBe(404);
    expect((await like.POST(post(), ctx("blocked-author-post"))).status).toBe(403);
    expect((await save.POST(post(), ctx("blocked-author-post"))).status).toBe(403);
  });
  it("소스: POST 의 차단·가시성 게이트와 알림 호출 유지", () => {
    const src = readFileSync(resolve(process.cwd(), "app/api/community/posts/[postId]/like/route.ts"), "utf8");
    const postPart = src.slice(src.indexOf("export async function POST"), src.indexOf("export async function DELETE"));
    expect(postPart).toContain("assertPostEngagementAllowed");
    expect(postPart).toContain("notifyCommunityPostLikeReceived");
    const delPart = src.slice(src.indexOf("export async function DELETE"));
    expect(delPart).not.toContain("isBlockedEitherWay");
    expect(delPart).not.toContain("notify");
  });
});
