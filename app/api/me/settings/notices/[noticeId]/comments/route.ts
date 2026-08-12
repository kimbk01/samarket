import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  APP_NOTICES_CONTENT_SELECT,
  isCustomerCenterContentPublishedNow,
} from "@/lib/notices/customer-center-content";

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

  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 30);
  const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.floor(limitRaw))) : 30;
  const cursor = req.nextUrl.searchParams.get("cursor");

  let q = sb
    .from("customer_center_comments")
    .select(COMMENT_SELECT)
    .eq("content_id", contentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    q = q.lt("created_at", cursor);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({
      ok: true,
      comments: [],
      nextCursor: null,
      hint: error.message,
    });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? String(page[page.length - 1]?.created_at ?? "") || null : null;

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
      { ok: false, error: error?.message ?? "insert_failed" },
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
