import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { applyCommunityPointReclaimOnModeration } from "@/lib/points/community-point-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/community/engine/comments/:commentId
 * body: { status?: 'active'|'hidden'|'deleted' }
 * Soft status update only — no hard delete (preserves reclaim / counters contract).
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ commentId: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { commentId } = await ctx.params;
  const id = commentId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.status !== "active" && body.status !== "hidden" && body.status !== "deleted") {
    return NextResponse.json({ ok: false, error: "no_updates" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: existing, error: findErr } = await sb
    .from("community_comments")
    .select("id, post_id, user_id, status, is_hidden, is_deleted")
    .eq("id", id)
    .maybeSingle();
  if (findErr) return NextResponse.json({ ok: false, error: findErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const patch: Record<string, unknown> = {
    status: body.status,
    updated_at: new Date().toISOString(),
  };
  if (body.status === "hidden") {
    patch.is_hidden = true;
    patch.is_deleted = false;
  } else if (body.status === "deleted") {
    patch.is_deleted = true;
    patch.is_hidden = false;
  } else {
    patch.is_hidden = false;
    patch.is_deleted = false;
  }

  const { error } = await sb.from("community_comments").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  if (body.status === "hidden" || body.status === "deleted") {
    await applyCommunityPointReclaimOnModeration({
      targetId: id,
      targetType: "comment",
      triggerType: "admin_remove",
    });
  }

  const meta = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: admin.userId,
    target_type: "community_comment",
    target_id: id,
    action: `community_comment.status_${body.status}`,
    before_json: {
      post_id: (existing as { post_id?: string | null }).post_id ?? null,
      user_id: (existing as { user_id?: string | null }).user_id ?? null,
      status: (existing as { status?: string | null }).status ?? null,
      is_hidden: (existing as { is_hidden?: boolean | null }).is_hidden ?? null,
      is_deleted: (existing as { is_deleted?: boolean | null }).is_deleted ?? null,
    },
    after_json: patch,
    ip: meta.ip,
    user_agent: meta.userAgent,
  });

  return NextResponse.json({ ok: true });
}
