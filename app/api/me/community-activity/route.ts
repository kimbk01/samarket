import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  loadCommunityActivityHubServer,
  loadCommunityActivityTabPageServer,
} from "@/lib/mypage/community-activity-load-server";
import { parseCommunityActivityHubTab } from "@/lib/mypage/community-activity-types";
import {
  MYPAGE_LIST_PAGE_DEFAULT,
  parseMypageListCursor,
  parseMypageListLimit,
} from "@/lib/mypage/mypage-list-cursor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/community-activity
 * - 무 `tab`: 현행 5종 각 20건 묶음(소비자 `CommunityTab` — 별칭 `favoritePosts`/`reactions` 불변).
 * - `?tab=comments|reactions|saved|reports&limit=20&cursor=<created_at|id>` (최종 설계 C.0.3 A5)
 *   → `{ ok, tab, items, next_cursor }`. 실패 500.
 */
export async function GET(req?: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sp = req?.nextUrl?.searchParams ?? new URLSearchParams();
  const tab = parseCommunityActivityHubTab(sp.get("tab"));

  if (tab) {
    const rawCursor = sp.get("cursor");
    const cursor = parseMypageListCursor(rawCursor);
    if (rawCursor && rawCursor.trim() && !cursor) {
      return NextResponse.json({ ok: false, error: "invalid_cursor" }, { status: 400 });
    }
    try {
      const page = await loadCommunityActivityTabPageServer(auth.userId, {
        tab,
        limit: parseMypageListLimit(sp.get("limit")) ?? MYPAGE_LIST_PAGE_DEFAULT,
        cursor,
      });
      return NextResponse.json({ ok: true, tab: page.tab, items: page.items, next_cursor: page.next_cursor });
    } catch {
      return NextResponse.json({ ok: false, error: "activity_fetch_failed" }, { status: 500 });
    }
  }

  try {
    const data = await loadCommunityActivityHubServer(auth.userId);
    return NextResponse.json({
      ok: true,
      comments: data.comments,
      likedPosts: data.likedPosts,
      savedPosts: data.savedPosts,
      /** Saves only — My 저장한 글 / legacy favoritePosts consumer */
      favoritePosts: data.savedPosts,
      /** Likes only — hub "공감한 글" / reactions consumer */
      reactions: data.likedPosts,
      reports: data.reports,
      source: data.source,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message ?? "activity_fetch_failed" },
      { status: 500 }
    );
  }
}
