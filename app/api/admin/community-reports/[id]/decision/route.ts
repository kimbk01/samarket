import { NextRequest, NextResponse } from "next/server";
import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import {
  communitySanctionRpcErrorStatus,
  parseCommunitySanctionInput,
  type CommunitySanctionInput,
} from "@/lib/admin/community-admin/community-sanction-input";
import {
  notifyCommunityContentModerated,
  notifyCommunityReportProcessed,
  notifyCommunitySanction,
} from "@/lib/notifications/notify-community-moderation";
import { applyCommunityPointReclaimFromReportTarget } from "@/lib/points/community-point-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DecideAction = {
  action?: string;
  target_type?: string;
  from_status?: string | null;
  skipped?: string;
  sanction_id?: string;
  restriction?: string | null;
  days?: number | null;
};

type DecideResult = {
  ok?: boolean;
  error?: string;
  current_status?: string;
  status?: string;
  target_type?: string | null;
  target_id?: string | null;
  target_user_id?: string | null;
  target_found?: boolean;
  reporter_id?: string | null;
  actions?: DecideAction[];
  closed_report_ids?: string[];
};

async function safe(label: string, task: () => Promise<unknown>): Promise<boolean> {
  try {
    await task();
    return true;
  } catch (e) {
    console.error("[community-report-decision]", label, e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * POST /api/admin/community-reports/:id/decision — 신고 인정/기각 + 조치 한 요청 (설계 §E-5).
 * body: { expectedStatus, decision: 'resolved'|'dismissed', reason, targetAction?: 'none'|'hide'|'delete',
 *         sanction?: { kind: 'warning'|'community_restriction', restriction?, days? } | null, closeSameTarget? }
 * 신고 CAS·콘텐츠 조치·제재는 RPC 한 트랜잭션. 포인트 회수·알림·감사는 성공 후 실행.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireCommunityAdmin("moderation");
  if (!admin.ok) return admin.response;

  const { id } = await ctx.params;
  const rid = id?.trim();
  if (!rid) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const expectedStatus = String(body.expectedStatus ?? "").trim();
  if (expectedStatus !== "open" && expectedStatus !== "reviewing") {
    return NextResponse.json({ ok: false, error: "expected_status_required" }, { status: 400 });
  }
  const decision = String(body.decision ?? "").trim();
  if (decision !== "resolved" && decision !== "dismissed") {
    return NextResponse.json({ ok: false, error: "invalid_decision" }, { status: 400 });
  }
  const reason = normalizeCommunityAdminReason(body.reason);
  if (!reason) return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });

  const targetAction = body.targetAction == null ? "none" : String(body.targetAction).trim();
  if (targetAction !== "none" && targetAction !== "hide" && targetAction !== "delete") {
    return NextResponse.json({ ok: false, error: "invalid_target_action" }, { status: 400 });
  }
  let sanction: CommunitySanctionInput | null = null;
  if (body.sanction != null) {
    const parsed = parseCommunitySanctionInput(body.sanction);
    if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    sanction = parsed.value;
  }
  if (decision === "dismissed" && (targetAction !== "none" || sanction)) {
    return NextResponse.json({ ok: false, error: "dismiss_with_action" }, { status: 400 });
  }
  const closeSameTarget = body.closeSameTarget === true;

  const sb = admin.sb;
  const { data: rpcData, error: rpcErr } = await sb.rpc("admin_community_report_decide", {
    p_report_id: rid,
    p_expected_status: expectedStatus,
    p_decision: decision,
    p_actor_id: admin.userId,
    p_reason: reason,
    p_target_action: targetAction,
    p_sanction_kind: sanction?.kind ?? null,
    p_sanction_restriction: sanction?.restriction ?? null,
    p_sanction_days: sanction?.days ?? null,
    p_close_same_target: closeSameTarget,
  });
  if (rpcErr) {
    return NextResponse.json({ ok: false, error: rpcErr.message }, { status: 500 });
  }
  const r = (rpcData ?? {}) as DecideResult;
  if (r.ok !== true) {
    const err = String(r.error ?? "decision_failed");
    return NextResponse.json(
      { ok: false, error: err, ...(r.current_status ? { current_status: r.current_status } : {}) },
      { status: communitySanctionRpcErrorStatus(err) }
    );
  }

  const targetType = String(r.target_type ?? "");
  const targetId = String(r.target_id ?? "");
  const targetUserId = r.target_user_id ? String(r.target_user_id) : null;
  const actions = Array.isArray(r.actions) ? r.actions : [];
  const closedIds = (Array.isArray(r.closed_report_ids) ? r.closed_report_ids : []).map(String).filter(Boolean);
  let sideEffectWarning = false;

  // 포인트 회수 — 기존 PATCH(resolved) 와 같은 경로. 원장 unique 로 대상당 1회 (묶어 닫은 신고도 같은 대상)
  if (decision === "resolved" && targetId) {
    const okReclaim = await safe("reclaim", () =>
      applyCommunityPointReclaimFromReportTarget({ targetType, targetId })
    );
    if (!okReclaim) sideEffectWarning = true;
  }

  let auditOk = true;
  const contentAction = actions.find((a) => (a.action === "hide" || a.action === "delete") && !a.skipped);
  if (contentAction && targetUserId) {
    const kind = contentAction.action === "hide" ? "hidden" : "deleted";
    let postId = targetType === "post" ? targetId : "";
    if (targetType === "comment") {
      const { data: c } = await sb.from("community_comments").select("post_id").eq("id", targetId).maybeSingle();
      postId = String((c as { post_id?: string } | null)?.post_id ?? "");
    }
    if (postId) {
      const ok = await safe("notify_content", () =>
        notifyCommunityContentModerated(sb, {
          userId: targetUserId,
          postId,
          commentId: targetType === "comment" ? targetId : null,
          kind,
          reason,
          dedupeId: rid,
        })
      );
      if (!ok) sideEffectWarning = true;
    }
    const a = await appendCommunityAdminAudit(sb, req, {
      actorId: admin.userId,
      targetType: targetType === "comment" ? "community_comment" : "community_post",
      targetId,
      action: `${targetType === "comment" ? "community_comment" : "community_post"}.status_${kind}`,
      reason,
      before: { status: contentAction.from_status ?? null },
      after: { status: kind, source_report_id: rid },
    });
    if (!a.ok) auditOk = false;
  }

  const sanctionAction = actions.find(
    (a) => (a.action === "warning" || a.action === "community_restriction") && !a.skipped && a.sanction_id
  );
  if (sanctionAction && targetUserId) {
    const sanctionId = String(sanctionAction.sanction_id);
    const { data: srow } = await sb.from("sanctions").select("end_at").eq("id", sanctionId).maybeSingle();
    const endAt = (srow as { end_at?: string | null } | null)?.end_at ?? null;
    const restriction = sanction?.restriction ?? null;
    const ok = await safe("notify_sanction", () =>
      notifyCommunitySanction(sb, {
        userId: targetUserId,
        sanctionId,
        kind: sanctionAction.action === "warning" ? "warning" : "restriction",
        restriction,
        endAt,
        reason,
      })
    );
    if (!ok) sideEffectWarning = true;
    const a = await appendCommunityAdminAudit(sb, req, {
      actorId: admin.userId,
      targetType: "community_sanction",
      targetId: sanctionId,
      action: `community_sanction.apply_${sanctionAction.action}`,
      reason,
      after: {
        user_id: targetUserId,
        kind: sanctionAction.action,
        restriction,
        days: sanction?.days ?? null,
        end_at: endAt,
        source_report_id: rid,
      },
    });
    if (!a.ok) auditOk = false;
  }

  // 신고자: 처리 완료만 (O-11) — 이 신고 + 함께 닫은 신고
  const reporterTargets: Array<{ reporterId: string; reportId: string }> = [];
  if (r.reporter_id) reporterTargets.push({ reporterId: String(r.reporter_id), reportId: rid });
  if (closedIds.length) {
    const { data: closedRows } = await sb.from("community_reports").select("id, user_id").in("id", closedIds);
    for (const row of (closedRows ?? []) as Array<{ id: string; user_id: string | null }>) {
      if (row.user_id) reporterTargets.push({ reporterId: row.user_id, reportId: row.id });
    }
  }
  for (const t of reporterTargets) {
    const ok = await safe("notify_reporter", () => notifyCommunityReportProcessed(sb, t));
    if (!ok) sideEffectWarning = true;
  }

  const mainAudit = await appendCommunityAdminAudit(sb, req, {
    actorId: admin.userId,
    targetType: "community_report",
    targetId: rid,
    action: "community_report.decision",
    reason,
    before: { status: expectedStatus, target_type: targetType, target_id: targetId },
    after: {
      status: decision,
      target_action: targetAction,
      sanction,
      actions,
      closed_report_ids: closedIds,
    },
  });
  if (!mainAudit.ok) auditOk = false;

  return NextResponse.json({
    ok: true,
    status: decision,
    targetType,
    targetId,
    targetUserId,
    targetFound: r.target_found === true,
    actions,
    closedReportIds: closedIds,
    ...(auditOk ? {} : { auditWarning: true }),
    ...(sideEffectWarning ? { sideEffectWarning: true } : {}),
  });
}
