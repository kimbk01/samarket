import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { NextRequest, NextResponse } from "next/server";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import { notifyCommunityContentModerated } from "@/lib/notifications/notify-community-moderation";
import { applyCommunityPointReclaimOnModeration } from "@/lib/points/community-point-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/community/engine/comments/:commentId
 * body: { status: 'active'|'hidden'|'deleted', expectedStatus: string, reason?: string }
 * - 숨김·삭제는 사유 필수 (복구는 선택). CAS: 현재 상태가 expectedStatus 와 다르면 409 { error:'conflict', comment }.
 * Soft status update only — no hard delete (preserves reclaim / counters contract).
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ commentId: string }> }
) {
  const admin = await requireCommunityAdmin("content");
  if (!admin.ok) return admin.response;
  const { sb } = admin;

  const { commentId } = await ctx.params;
  const id = commentId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: { status?: string; expectedStatus?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.status !== "active" && body.status !== "hidden" && body.status !== "deleted") {
    return NextResponse.json({ ok: false, error: "no_updates" }, { status: 400 });
  }
  const expectedStatus = typeof body.expectedStatus === "string" ? body.expectedStatus.trim() : "";
  if (!expectedStatus) {
    return NextResponse.json({ ok: false, error: "expected_status_required" }, { status: 400 });
  }
  const reason = normalizeCommunityAdminReason(body.reason);
  const removing = body.status === "hidden" || body.status === "deleted";
  if (removing && !reason) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

  const COMMENT_SELECT = "id, post_id, user_id, status, is_hidden, is_deleted, moderated_by, moderated_at, moderation_reason, updated_at";
  const { data: existing, error: findErr } = await sb
    .from("community_comments")
    .select(COMMENT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (findErr) return NextResponse.json({ ok: false, error: findErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const ex = existing as {
    post_id?: string | null;
    user_id?: string | null;
    status?: string | null;
    is_hidden?: boolean | null;
    is_deleted?: boolean | null;
  };
  if (String(ex.status ?? "") !== expectedStatus) {
    return NextResponse.json({ ok: false, error: "conflict", comment: existing }, { status: 409 });
  }
  if (ex.status === body.status) {
    return NextResponse.json({ ok: true, comment: existing, unchanged: true });
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: body.status,
    updated_at: nowIso,
    moderated_by: admin.userId,
    moderated_at: nowIso,
    moderation_reason: reason,
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

  const { data: updated, error } = await sb
    .from("community_comments")
    .update(patch)
    .eq("id", id)
    .eq("status", expectedStatus)
    .select(COMMENT_SELECT)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!updated) {
    const { data: fresh } = await sb.from("community_comments").select(COMMENT_SELECT).eq("id", id).maybeSingle();
    return NextResponse.json({ ok: false, error: "conflict", comment: fresh ?? null }, { status: 409 });
  }

  if (removing) {
    await applyCommunityPointReclaimOnModeration({
      targetId: id,
      targetType: "comment",
      triggerType: "admin_remove",
    });
  }

  const audit = await appendCommunityAdminAudit(sb, req, {
    actorId: admin.userId,
    targetType: "community_comment",
    targetId: id,
    action: `community_comment.status_${body.status}`,
    reason,
    before: {
      post_id: ex.post_id ?? null,
      user_id: ex.user_id ?? null,
      status: ex.status ?? null,
      is_hidden: ex.is_hidden ?? null,
      is_deleted: ex.is_deleted ?? null,
    },
    after: patch,
  });

  const postId = String(ex.post_id ?? "");
  if (postId) {
    try {
      await notifyCommunityContentModerated(sb, {
        userId: ex.user_id,
        postId,
        commentId: id,
        kind: body.status === "hidden" ? "hidden" : body.status === "deleted" ? "deleted" : "restored",
        reason,
        dedupeId: `${id}:${nowIso}`,
      });
    } catch (e) {
      console.error("[admin comment patch] notify", e);
    }
  }

  return NextResponse.json({ ok: true, comment: updated, auditOk: audit.ok });
}
