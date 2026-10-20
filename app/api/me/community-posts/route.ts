import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { listCommunityPostsForUser } from "@/lib/community-feed/queries";
import { listOwnCommunityPostsPage } from "@/lib/community-feed/list-community-posts-for-user";
import {
  MYPAGE_LIST_PAGE_DEFAULT,
  parseMypageListCursor,
  parseMypageListLimit,
} from "@/lib/mypage/mypage-list-cursor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/community-posts
 * - 기본(`scope` 없음): 현행 그대로 — `limit` 1–20(기본 5), 공개 글만 `{ ok, posts }`
 *   (소비자: 내정보 커뮤니티 탭 미리보기 `?limit=6`, 피드 광고 신청 `?limit=20`).
 * - `scope=own` (최종 설계 C.0.3 A4 · S26): `?status=active|hidden&limit=20&cursor=<created_at|id>`
 *   → `{ ok, posts(+isHiddenForOwner), next_cursor, total? }` (`total` 은 첫 페이지만). 실패는 500 `{ ok:false }`.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sp = req.nextUrl.searchParams;

  if (sp.get("scope") === "own") {
    const status = sp.get("status") === "hidden" ? "hidden" : "active";
    const limit = parseMypageListLimit(sp.get("limit")) ?? MYPAGE_LIST_PAGE_DEFAULT;
    const rawCursor = sp.get("cursor");
    const cursor = parseMypageListCursor(rawCursor);
    if (rawCursor && rawCursor.trim() && !cursor) {
      return NextResponse.json({ ok: false, error: "invalid_cursor" }, { status: 400 });
    }
    const page = await listOwnCommunityPostsPage(auth.userId, { status, limit, cursor, withTotal: !cursor });
    if (!page.ok) {
      return NextResponse.json(
        { ok: false, error: "community_posts_load_failed" },
        { status: 500, headers: { "Cache-Control": "private, no-store" } }
      );
    }
    return NextResponse.json(
      {
        ok: true,
        posts: page.posts,
        next_cursor: page.next_cursor,
        ...(page.total != null ? { total: page.total } : {}),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const limitRaw = Number(sp.get("limit") ?? "");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 20) : 5;
  const posts = await listCommunityPostsForUser(auth.userId, limit);

  return NextResponse.json(
    { ok: true, posts },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
