import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { buildAppNoticeDetailPath } from "@/lib/notices/app-notice-paths";
import {
  APP_NOTICES_CONTENT_SELECT,
  isCustomerCenterContentPublishedNow,
  isCustomerCenterContentType,
  parseCustomerCenterContentType,
  resolveCustomerCenterAuthorLabel,
} from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardDetailPath } from "@/lib/notices/customer-center-content-paths";
import { normalizeCustomerCenterHeroImageUrl } from "@/lib/notices/customer-center-media";
import { isMissingAppNoticesTableError } from "@/lib/notices/is-missing-app-notices-table-error";
import {
  CC_BOARD_PAGE_DEFAULT,
  ccBoardIlikePattern,
  normalizeCcBoardQuery,
  parseCcCursor,
  parseCcPageLimit,
} from "@/lib/mypage/customer-center-board-query";
import { encodeMypageListCursor, mypageKeysetOrFilter } from "@/lib/mypage/mypage-list-cursor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Member board list — Content SSOT only (not Bell merge).
 * `?content_type=notice|system|marketing&q=&cursor=&limit=` (최종 설계 S61 · API A12)
 *
 * - 응답 `{ ok, notices, nextCursor, source }` — `notices`·`href`(구 경로, K11)·`canonicalHref` 하위 호환 유지.
 * - 커서 = `created_at|id` keyset, 기본 20건(최대 50).
 * - 실패를 빈 성공으로 응답하지 않는다: 서비스 없음 503 · 테이블 없음 503(`table_missing`) · DB 오류 500.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const limit = parseCcPageLimit(sp.get("limit"), CC_BOARD_PAGE_DEFAULT);
  const cursorParse = parseCcCursor(sp.get("cursor"));
  if (!cursorParse.ok) {
    return NextResponse.json({ ok: false, error: "invalid_cursor" }, { status: 400 });
  }
  const searchQ = normalizeCcBoardQuery(sp.get("q"));
  const typeRaw = sp.get("content_type");

  let q = sb
    .from("app_notices")
    .select(APP_NOTICES_CONTENT_SELECT)
    .eq("is_active", true)
    .is("deleted_at", null)
    .is("archived_at", null);
  if (isCustomerCenterContentType(typeRaw)) {
    q = q.eq("content_type", typeRaw);
  }
  if (searchQ) {
    q = q.ilike("title", ccBoardIlikePattern(searchQ));
  }
  if (cursorParse.cursor) {
    q = q.or(mypageKeysetOrFilter(cursorParse.cursor, "created_at"));
  }

  const { data: boardRows, error: boardError } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (boardError) {
    if (isMissingAppNoticesTableError(boardError.message ?? "")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "notices_fetch_failed" }, { status: 500 });
  }

  const rawRows = boardRows ?? [];
  const pageRows = rawRows.slice(0, limit);
  const lastRaw = pageRows[pageRows.length - 1];
  /** 다음 커서는 읽은 원본 행 기준 — 게시 기간 밖 행을 걸러도 페이지 진행이 끊기지 않는다 */
  const nextCursor =
    rawRows.length > limit && lastRaw ? encodeMypageListCursor(String(lastRaw.created_at ?? ""), String(lastRaw.id ?? "")) : null;

  const notices = [];
  for (const row of pageRows) {
    if (!isCustomerCenterContentPublishedNow(row)) continue;
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const contentType = parseCustomerCenterContentType(row.content_type, "notice");
    notices.push({
      id,
      contentType,
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      heroImageUrl: normalizeCustomerCenterHeroImageUrl(row.hero_image_url),
      authorLabel: resolveCustomerCenterAuthorLabel({
        contentType,
        authorLabel: row.author_label,
      }),
      viewCount: Number(row.view_count) || 0,
      commentCount: Number(row.comment_count) || 0,
      commentEnabled: row.comment_enabled !== false,
      createdAt: String(row.published_at ?? row.created_at ?? ""),
      href: buildAppNoticeDetailPath(id),
      canonicalHref: buildCustomerCenterBoardDetailPath(contentType, id),
      source: "board" as const,
    });
  }

  return NextResponse.json({
    ok: true,
    notices,
    nextCursor,
    source: "app_notices_ssot",
  });
}
