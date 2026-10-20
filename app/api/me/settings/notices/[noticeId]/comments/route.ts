import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  APP_NOTICES_CONTENT_SELECT,
  isCustomerCenterContentPublishedNow,
} from "@/lib/notices/customer-center-content";
import {
  CC_COMMENTS_PAGE_DEFAULT,
  isCcMissingTableError,
  parseCcCursor,
  parseCcPageLimit,
} from "@/lib/mypage/customer-center-board-query";
import { encodeMypageListCursor, mypageKeysetOrFilter } from "@/lib/mypage/mypage-list-cursor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ noticeId: string }> };

const COMMENT_SELECT =
  "id, content_id, user_id, body, deleted_at, created_at, updated_at";

/** GET — paginated Customer Center comments (not Community). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { noticeId: raw } = await ctx.params;
  const contentId = String(raw ?? "").trim();
  if (!contentId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const limit = parseCcPageLimit(req.nextUrl.searchParams.get("limit"), CC_COMMENTS_PAGE_DEFAULT);
  const cursorParse = parseCcCursor(req.nextUrl.searchParams.get("cursor"), { allowLegacyTs: true });
  if (!cursorParse.ok) {
    return NextResponse.json({ ok: false, error: "invalid_cursor" }, { status: 400 });
  }

  let q = sb
    .from("customer_center_comments")
    .select(COMMENT_SELECT)
    .eq("content_id", contentId)
    .is("deleted_at", null);

  if (cursorParse.cursor) {
    q = q.or(mypageKeysetOrFilter(cursorParse.cursor, "created_at"));
  } else if (cursorParse.legacyTs) {
    q = q.lt("created_at", cursorParse.legacyTs);
  }

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  /** 최종 설계 S62 · API A13 — DB 오류를 빈 성공으로 응답하지 않는다 */
  if (error) {
    if (isCcMissingTableError(error, "customer_center_comments")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "comments_fetch_failed" }, { status: 500 });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeMypageListCursor(String(last.created_at ?? ""), String(last.id ?? "")) : null;

  return NextResponse.json({
    ok: true,
    comments: page.map((c) => ({
      id: String(c.id),
      contentId: String(c.content_id),
      userId: String(c.user_id),
      body: String(c.body ?? ""),
      createdAt: String(c.created_at ?? ""),
      mine: String(c.user_id) === auth.userId,
    })),
    nextCursor,
  });
}

/** POST — create comment. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { noticeId: raw } = await ctx.params;
  const contentId = String(raw ?? "").trim();
  if (!contentId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const bodyJson = (await req.json().catch(() => ({}))) as { body?: string };
  const text = String(bodyJson.body ?? "").trim().slice(0, 2000);
  if (!text) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const { data: content, error: contentErr } = await sb
    .from("app_notices")
    .select(APP_NOTICES_CONTENT_SELECT)
    .eq("id", contentId)
    .maybeSingle();

  if (contentErr || !content) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!isCustomerCenterContentPublishedNow(content) || content.comment_enabled === false) {
    return NextResponse.json({ ok: false, error: "comments_disabled" }, { status: 403 });
  }

  const now = new Date().toISOString();
  const { data: inserted, error } = await sb
    .from("customer_center_comments")
    .insert({
      content_id: contentId,
      user_id: auth.userId,
      body: text,
      created_at: now,
      updated_at: now,
    })
    .select(COMMENT_SELECT)
    .single();

  if (error || !inserted) {
    return NextResponse.json(
      { ok: false, error: "insert_failed" },
      { status: 500 }
    );
  }

  const nextCount = Math.max(0, Number(content.comment_count) || 0) + 1;
  await sb.from("app_notices").update({ comment_count: nextCount, updated_at: now }).eq("id", contentId);

  return NextResponse.json({
    ok: true,
    comment: {
      id: String(inserted.id),
      contentId: String(inserted.content_id),
      userId: String(inserted.user_id),
      body: String(inserted.body ?? ""),
      createdAt: String(inserted.created_at ?? ""),
      mine: true,
    },
  });
}
