export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/favorites/list — 세션 사용자의 찜한 게시글 목록 (찜한 순)
 * 클라이언트 직접 Supabase 조회(RLS/세션 불일치) 대신 service role + api-session userId 사용.
 * 조회는 `loadFavoritePostsServer` 단일 함수(내정보 요약 `favoritesCount` 와 공유).
 *
 * `authenticated`: 쿠키·세션으로 식별된 사용자가 있으면 true (클라 `getCurrentUser()`와 별개)
 *
 * 페이지 모드(최종 설계 C.0.3 A2): `limit` 이 있을 때만
 * `?limit=20&cursor=<created_at|id>&chip=all|active|sold|gone&counts=1`(counts 는 첫 페이지만)
 * → `{ items, authenticated, next_cursor, counts? }`. 무인자 호출 = 현행 전체 응답 그대로.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  loadFavoritePostsPageServer,
  loadFavoritePostsServer,
} from "@/lib/favorites/load-favorite-posts-server";
import { parseMypageListCursor, parseMypageListLimit } from "@/lib/mypage/mypage-list-cursor";
import type { FavoriteManageTabId } from "@/lib/mypage/favorite-manage-tabs";

function parseChip(raw: string | null): FavoriteManageTabId {
  return raw === "active" || raw === "sold" || raw === "gone" ? raw : "all";
}

export async function GET(req?: NextRequest) {
  const sp = req?.nextUrl?.searchParams ?? new URLSearchParams();
  const pageLimit = parseMypageListLimit(sp.get("limit"));
  const userId = (await getOptionalAuthenticatedUserId()) ?? "";
  if (!userId) {
    return NextResponse.json({ items: [], authenticated: false });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ items: [], authenticated: false });
  }

  if (pageLimit != null) {
    const rawCursor = sp.get("cursor");
    const cursor = parseMypageListCursor(rawCursor);
    if (rawCursor && rawCursor.trim() && !cursor) {
      return NextResponse.json({ items: [], authenticated: true, error: "invalid_cursor" }, { status: 400 });
    }
    const page = await loadFavoritePostsPageServer(sb, userId, {
      limit: pageLimit,
      cursor,
      chip: parseChip(sp.get("chip")),
      withCounts: sp.get("counts") === "1" && !cursor,
    });
    if (!page.ok) {
      if (process.env.NODE_ENV === "development") {
        console.error(`[favorites/list] page ${page.phase}:`, page.message);
      }
      return NextResponse.json({ items: [], authenticated: true, error: "favorites_load_failed" }, { status: 500 });
    }
    return NextResponse.json({
      items: page.items,
      authenticated: true,
      next_cursor: page.next_cursor,
      ...(page.counts ? { counts: page.counts } : {}),
    });
  }

  const loaded = await loadFavoritePostsServer(sb, userId);
  if (!loaded.ok) {
    if (process.env.NODE_ENV === "development") {
      console.error(`[favorites/list] ${loaded.phase} select:`, loaded.message);
    }
    // 조회 실패를 「찜 없음」으로 보이지 않게 오류로 응답 (D10)
    return NextResponse.json({ items: [], authenticated: true, error: "favorites_load_failed" }, { status: 500 });
  }

  return NextResponse.json({ items: loaded.items, authenticated: true });
}
