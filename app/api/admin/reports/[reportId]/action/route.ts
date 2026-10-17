import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { applyReportActionDaangn } from "@/lib/admin-reports/applyReportActionDaangn";
import { TRADE_REPORT_ACTION_TYPES } from "@/lib/admin-reports/trade-report-action-policy";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import type { ReportActionType } from "@/lib/types/daangn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/reports/[reportId]/action — Trade report (`reports`) resolve writer.
 *
 * Authority = admin_memberships + staff permission `reports` (server SSOT).
 * Writes run with the service-role client; RLS on `reports` is not the authority.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ reportId: string }> }) {
  const gate = await requireAdminPermission("reports");
  if (!gate.ok) return gate.response;

  const { reportId } = await ctx.params;
  const rid = reportId?.trim();
  if (!rid) {
    return NextResponse.json({ ok: false, error: "missing_report_id" }, { status: 400 });
  }

  let body: { action_type?: string; target_user_id?: string | null; action_note?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const actionType = String(body.action_type ?? "").trim() as ReportActionType;
  if (!TRADE_REPORT_ACTION_TYPES.has(actionType)) {
    return NextResponse.json({ ok: false, error: "invalid_action_type" }, { status: 400 });
  }
  const actionNote =
    body.action_note != null && String(body.action_note).trim()
      ? String(body.action_note).trim().slice(0, 2000)
      : null;

  const result = await applyReportActionDaangn(gate.sb, {
    reportId: rid,
    actionType,
    targetUserId: String(body.target_user_id ?? ""),
    actionNote,
    adminUserId: gate.actor.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });
  }

  const meta = getAuditRequestMeta(req);
  void appendAuditLog(gate.sb, {
    actor_type: "admin",
    actor_id: gate.actor.userId,
    target_type: "trade_report",
    target_id: rid,
    action: `trade_report.${actionType}`,
    before_json: { status: result.previousStatus },
    after_json: { status: result.status, action_note: actionNote, warnings: result.warnings },
    ip: meta.ip,
    user_agent: meta.userAgent,
  });

  return NextResponse.json({
    ok: true,
    status: result.status,
    warnings: result.warnings,
  });
}
