import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { NextRequest, NextResponse } from "next/server";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import {
  isMeetingReportStatus,
  resolveMeetingReportTransition,
} from "@/lib/admin/community-admin/community-report-transitions";
import {
  getMeetingReportStatusForAdmin,
  updateMeetingReportStatus,
} from "@/lib/neighborhood/admin-meeting-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ reportId: string }>;
}

/**
 * PATCH /api/admin/philife/meeting-reports/[reportId] — 모임 신고 상태 변경 (CAS · 전이표 · 사유)
 * body: { status, expectedStatus, reason?(인정·기각·재오픈 필수), action_result? }
 * 전이: pending→reviewing · pending|reviewing→resolved|rejected · resolved|rejected→pending(최고 관리자)
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const admin = await requireCommunityAdmin("moderation");
  if (!admin.ok) return admin.response;

  const { reportId } = await ctx.params;
  const rid = reportId?.trim();
  if (!rid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: { status?: string; expectedStatus?: string; reason?: string; action_result?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const newStatus = body?.status;
  if (!isMeetingReportStatus(newStatus)) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }
  const expected = body.expectedStatus;
  if (!isMeetingReportStatus(expected)) {
    return NextResponse.json({ ok: false, error: "expected_status_required" }, { status: 400 });
  }

  const sb = admin.sb;
  const cur = await getMeetingReportStatusForAdmin(sb, rid);
  if (!cur.ok) return NextResponse.json({ ok: false, error: cur.error }, { status: 500 });
  if (!cur.row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (cur.row.status !== expected) {
    return NextResponse.json(
      { ok: false, error: "conflict", current_status: cur.row.status },
      { status: 409 }
    );
  }

  const t = resolveMeetingReportTransition(expected, newStatus, admin.actor.isSuperAdmin);
  if (!t.ok) {
    return NextResponse.json(
      { ok: false, error: t.error, current_status: cur.row.status },
      { status: t.error === "reopen_super_admin_only" ? 403 : 400 }
    );
  }
  const reason = normalizeCommunityAdminReason(body.reason);
  if (t.reasonRequired && !reason) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }
  const actionResult =
    typeof body.action_result === "string" && body.action_result.trim()
      ? body.action_result.trim().slice(0, 1000)
      : t.kind === "decide"
        ? reason
        : undefined;

  const result = await updateMeetingReportStatus(sb, {
    reportId: rid,
    expectedStatus: expected,
    status: newStatus,
    reviewedBy: admin.userId,
    actionResult,
  });
  if (!result.ok) {
    if (result.error === "conflict") {
      return NextResponse.json({ ok: false, error: "conflict" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  const audit = await appendCommunityAdminAudit(sb, req, {
    actorId: admin.userId,
    targetType: "meeting_report",
    targetId: rid,
    action: t.kind === "reopen" ? "meeting_report.reopen" : `meeting_report.status_${newStatus}`,
    reason,
    before: { status: expected, action_result: cur.row.action_result },
    after: { status: newStatus, ...(actionResult !== undefined ? { action_result: actionResult } : {}) },
  });

  return NextResponse.json({ ok: true, status: newStatus, ...(audit.ok ? {} : { auditWarning: true }) });
}
