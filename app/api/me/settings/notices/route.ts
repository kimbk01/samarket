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
import {
  isCustomerCenterContentNew,
  isCustomerCenterContentUnread,
  loadCustomerCenterUnreadCounts,
  loadMemberJoinedAt,
  loadMemberReadContentIds,
  markCustomerCenterContentsRead,
} from "@/lib/notices/customer-center-read-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Member board list — Content SSOT only (not Bell merge).
 * `?content_type=notice|system|marketing&q=&cursor=&limit=` (최종 설계 S61 · API A12)
 *
 * - 응답 `{ ok, notices, nextCursor, source }` — `notices`·`href`(구 경로, K11)·`canonicalHref` 하위 호환 유지.
 * - 알림 최종 설계 §5 (Owner 승인 2026-11-01): 게시일(`published_at`) 최신순 · 글마다 `read`·`isNew` ·
 *   `?filter=unread` 안읽음만 · `?unread_counts=1` 분야별 안 읽은 글 수. 커서 = `published_at|id` keyset.
 * - 기본 20건(최대 50).
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
  if (sp.get("unread_counts") === "1") {
    try {
      const counts = await loadCustomerCenterUnreadCounts(sb, auth.userId);
      return NextResponse.json({ ok: true, unread_counts: counts });
    } catch {
      return NextResponse.json({ ok: false, error: "notices_fetch_failed" }, { status: 500 });
    }
  }

  const searchQ = normalizeCcBoardQuery(sp.get("q"));
  const typeRaw = sp.get("content_type");
  const unreadOnly = sp.get("filter") === "unread";

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
    q = q.or(mypageKeysetOrFilter(cursorParse.cursor, "published_at"));
  }

  // 안읽음만 보기는 읽은 글을 거른 뒤 한 페이지를 채우도록 더 넉넉히 읽는다(게시판 글 수는 수십 건 규모).
  const fetchCount = unreadOnly ? Math.max(limit * 5, 100) : limit + 1;
  const { data: boardRows, error: boardError } = await q
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(fetchCount);

  if (boardError) {
    if (isMissingAppNoticesTableError(boardError.message ?? "")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "notices_fetch_failed" }, { status: 500 });
  }

  const allRaw = boardRows ?? [];
  const [readIds, joinedAt] = await Promise.all([
    loadMemberReadContentIds(
      sb,
      auth.userId,
      allRaw.map((r) => String(r.id ?? ""))
    ),
    loadMemberJoinedAt(sb, auth.userId),
  ]);
  const unreadOf = (row: (typeof allRaw)[number]) =>
    isCustomerCenterContentUnread({
      read: readIds.has(String(row.id ?? "")),
      publishedAt: String(row.published_at ?? row.created_at ?? ""),
      joinedAt,
    });
  const rawRows = unreadOnly ? allRaw.filter((r) => unreadOf(r)) : allRaw;
  const pageRows = rawRows.slice(0, limit);
  const lastRaw = pageRows[pageRows.length - 1];
  /** 다음 커서는 읽은 원본 행 기준 — 게시 기간 밖 행을 걸러도 페이지 진행이 끊기지 않는다 */
  const nextCursor =
    rawRows.length > limit && lastRaw
      ? encodeMypageListCursor(String(lastRaw.published_at ?? lastRaw.created_at ?? ""), String(lastRaw.id ?? ""))
      : null;

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
      appVersion: contentType === "update" && row.app_version ? String(row.app_version) : null,
      read: !unreadOf(row),
      isNew: isCustomerCenterContentNew(String(row.published_at ?? row.created_at ?? "")),
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

/**
 * POST `{ action: "mark_all_read", content_type? }` — 알림 최종 설계 §5 「모두 읽음」(분야별).
 * 열람 기록만 남기고(조회수 무변경) 같은 글을 가리키는 내 알림도 읽음 처리한다.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; content_type?: unknown };
  if (body.action !== "mark_all_read") {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }
  const type =
    body.content_type == null || body.content_type === ""
      ? null
      : isCustomerCenterContentType(body.content_type)
        ? body.content_type
        : "invalid";
  if (type === "invalid") {
    return NextResponse.json({ ok: false, error: "invalid_content_type" }, { status: 400 });
  }
  try {
    const result = await markCustomerCenterContentsRead(sb, auth.userId, type);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "mark_read_failed" }, { status: 500 });
  }
}
