import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** S26 A4 — 무 `scope` 응답 불변(CommunityTab ?limit=6, 피드 광고 신청 ?limit=20), scope=own 실패 500 */
const listCommunityPostsForUser = vi.fn(async (_uid: string, limit: number) => [{ id: `pub-${limit}` }]);
const listOwnCommunityPostsPage = vi.fn();
vi.mock("@/lib/auth/api-session", () => ({ requireAuthenticatedUserId: async () => ({ ok: true, userId: "u1" }) }));
vi.mock("@/lib/community-feed/queries", () => ({
  listCommunityPostsForUser: (uid: string, limit: number) => listCommunityPostsForUser(uid, limit),
}));
vi.mock("@/lib/community-feed/list-community-posts-for-user", () => ({
  listOwnCommunityPostsPage: (...a: unknown[]) => listOwnCommunityPostsPage(...a),
}));

const req = (u: string) => new NextRequest(new URL(u, "http://localhost"));

beforeEach(() => {
  listCommunityPostsForUser.mockClear();
  listOwnCommunityPostsPage.mockReset();
});

describe("GET /api/me/community-posts", () => {
  it("무 scope: 현행 limit 규칙(기본 5, 최대 20) · `{ ok, posts }`", async () => {
    const { GET } = await import("@/app/api/me/community-posts/route");
    expect(await (await GET(req("/api/me/community-posts?limit=6"))).json()).toEqual({ ok: true, posts: [{ id: "pub-6" }] });
    await GET(req("/api/me/community-posts"));
    await GET(req("/api/me/community-posts?limit=99"));
    expect(listCommunityPostsForUser.mock.calls.map((c) => c[1])).toEqual([6, 5, 20]);
    expect(listOwnCommunityPostsPage).not.toHaveBeenCalled();
  });

  it("scope=own: status·limit·cursor 전달, 첫 페이지만 total", async () => {
    listOwnCommunityPostsPage.mockResolvedValue({ ok: true, posts: [], next_cursor: null, total: 0 });
    const { GET } = await import("@/app/api/me/community-posts/route");
    const json = await (await GET(req("/api/me/community-posts?scope=own&status=hidden&limit=20"))).json();
    expect(json).toEqual({ ok: true, posts: [], next_cursor: null, total: 0 });
    expect(listOwnCommunityPostsPage).toHaveBeenCalledWith("u1", { status: "hidden", limit: 20, cursor: null, withTotal: true });
    await GET(req(`/api/me/community-posts?scope=own&limit=20&cursor=${encodeURIComponent("2026-10-01T00:00:00Z|abc")}`));
    expect(listOwnCommunityPostsPage.mock.calls[1]?.[1]).toEqual({
      status: "active",
      limit: 20,
      cursor: { ts: "2026-10-01T00:00:00Z", id: "abc" },
      withTotal: false,
    });
  });

  it("scope=own 실패 = 500 `{ ok:false }`", async () => {
    listOwnCommunityPostsPage.mockResolvedValue({ ok: false, error: "posts_query_failed" });
    const { GET } = await import("@/app/api/me/community-posts/route");
    const res = await GET(req("/api/me/community-posts?scope=own"));
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
  });
});
