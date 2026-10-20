export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/favorites/list — 세션 사용자의 찜한 게시글 목록 (찜한 순)
 * 클라이언트 직접 Supabase 조회(RLS/세션 불일치) 대신 service role + api-session userId 사용.
 * 조회는 `loadFavoritePostsServer` 단일 함수(내정보 요약 `favoritesCount` 와 공유).
 *
 * `authenticated`: 쿠키·세션으로 식별된 사용자가 있으면 true (클라 `getCurrentUser()`와 별개)
 */
import { NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { loadFavoritePostsServer } from "@/lib/favorites/load-favorite-posts-server";

export async function GET() {
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
