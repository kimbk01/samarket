import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ noticeId: string; commentId: string }> };

/** DELETE — soft-delete own comment (or admin). */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { noticeId: rawContent, commentId: rawComment } = await ctx.params;
  const contentId = String(rawContent ?? "").trim();
  const commentId = String(rawComment ?? "").trim();
  if (!contentId || !commentId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: row, error } = await sb
    .from("customer_center_comments")
    .select("id, content_id, user_id, deleted_at")
    .eq("id", commentId)
    .eq("content_id", contentId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (row.deleted_at) {
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }

  const isOwner = String(row.user_id) === auth.userId;
  if (!isOwner) {
    const admin = await requireAdminApiUser();
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  }

  const now = new Date().toISOString();
  const { error: updErr } = await sb
    .from("customer_center_comments")
    .update({ deleted_at: now, deleted_by: auth.userId, updated_at: now })
    .eq("id", commentId)
    .is("deleted_at", null);

  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  const { data: content } = await sb
    .from("app_notices")
    .select("comment_count")
    .eq("id", contentId)
    .maybeSingle();
  const nextCount = Math.max(0, (Number(content?.comment_count) || 0) - 1);
  await sb.from("app_notices").update({ comment_count: nextCount, updated_at: now }).eq("id", contentId);

  return NextResponse.json({ ok: true });
}
