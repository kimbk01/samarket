import { NextRequest, NextResponse } from "next/server";
import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import { communitySanctionRpcErrorStatus } from "@/lib/admin/community-admin/community-sanction-input";
import { notifyCommunitySanction } from "@/lib/notifications/notify-community-moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/community/restrictions/:id/revoke — 경고·활동 제한 해제 (L2, 사유 필수)
 * body: { reason } → { ok, id, user_id } | 409 { error: 'not_active' }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireCommunityAdmin("moderation");
  if (!admin.ok) return admin.response;
  const sb = admin.sb;

  const { id } = await ctx.params;
  const sid = id?.trim();
  if (!sid) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const reason = normalizeCommunityAdminReason(body?.reason);
  if (!reason) return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });

  const { data: before } = await sb
    .from("sanctions")
    .select("id, user_id, sanction_type, restriction, end_at, revoked_at")
    .eq("id", sid)
    .maybeSingle();

  const { data, error } = await sb.rpc("admin_revoke_community_sanction", {
    p_sanction_id: sid,
    p_actor_id: admin.userId,
    p_reason: reason,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const r = (data ?? {}) as { ok?: boolean; error?: string; id?: string; user_id?: string };
  if (r.ok !== true) {
    const err = String(r.error ?? "revoke_failed");
    return NextResponse.json({ ok: false, error: err }, { status: communitySanctionRpcErrorStatus(err) });
  }
  const userId = String(r.user_id ?? "");
  const prev = (before ?? null) as { restriction?: string | null; sanction_type?: string; end_at?: string | null } | null;
  const restriction =
    prev?.restriction === "post" || prev?.restriction === "comment" || prev?.restriction === "all"
      ? prev.restriction
      : null;

  let notifyWarning = false;
  if (userId) {
    try {
      await notifyCommunitySanction(sb, { userId, sanctionId: sid, kind: "revoked", restriction, reason });
    } catch (e) {
      notifyWarning = true;
      console.error("[community-restrictions] revoke notify", e instanceof Error ? e.message : e);
    }
  }
  const audit = await appendCommunityAdminAudit(sb, req, {
    actorId: admin.userId,
    targetType: "community_sanction",
    targetId: sid,
    action: "community_sanction.revoke",
    reason,
    before: prev ? { ...prev, revoked_at: null } : null,
    after: { user_id: userId, revoked: true },
  });

  return NextResponse.json({
    ok: true,
    id: sid,
    user_id: userId,
    ...(audit.ok ? {} : { auditWarning: true }),
    ...(notifyWarning ? { sideEffectWarning: true } : {}),
  });
}
