export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 내상품 목록 (본인이 올린 글) — 서비스 롤
 * GET /api/my/posts (세션)
 * 조회는 `loadMyPostsServer` 단일 함수(내정보 요약 `salesActiveCount` 와 공유).
 *
 * 페이지 모드(옵트인, 최종 설계 C.0.3 A1 · X23): `limit` 이 있을 때만
 * `?limit=20&cursor=<updated_at|id>&filter=all|active|sold|hidden&promoted=0|1`
 * → `{ posts, next_cursor }`. 무인자 호출(마켓 판매 허브·홍보 대상 훅·피드 광고 신청·e2e) 응답은 불변.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadMyPostsPageServer, loadMyPostsServer } from "@/lib/my/load-my-posts-server";
import { parseMypageListCursor, parseMypageListLimit } from "@/lib/mypage/mypage-list-cursor";
import {
  parseMyProductListingFilterKey,
  parseMyProductPromotedOnly,
} from "@/lib/products/my-product-listing-filter";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const sp = req.nextUrl?.searchParams ?? new URLSearchParams();
  const pageLimit = parseMypageListLimit(sp.get("limit"));
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    if (pageLimit != null) return NextResponse.json({ error: "my_posts_load_failed" }, { status: 500 });
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  if (pageLimit != null) {
    const rawCursor = sp.get("cursor");
    const cursor = parseMypageListCursor(rawCursor);
    if (rawCursor && rawCursor.trim() && !cursor) {
      return NextResponse.json({ error: "invalid_cursor" }, { status: 400 });
    }
    const page = await loadMyPostsPageServer(sbAny, userId, {
      limit: pageLimit,
      cursor,
      filter: parseMyProductListingFilterKey(sp.get("filter")),
      promotedOnly: parseMyProductPromotedOnly(sp.get("promoted")),
    });
    if (!page.ok) return NextResponse.json({ error: "my_posts_load_failed" }, { status: 500 });
    return NextResponse.json({ posts: page.posts, next_cursor: page.next_cursor });
  }

  const loaded = await loadMyPostsServer(sbAny, userId);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: 500 });
  }

  return NextResponse.json({ posts: loaded.posts });
}
