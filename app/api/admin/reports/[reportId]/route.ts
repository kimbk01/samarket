import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadAdminReportActions, loadAdminReportById } from "@/lib/admin-reports/admin-reports-read.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/reports/[reportId] — 신고 1건 + 처리 기록 (D-42 · D-43, 권한 키 `reports`) */
export async function GET(_req: Request, ctx: { params: Promise<{ reportId: string }> }) {
  const admin = await requireAdminPermission("reports");
  if (!admin.ok) return admin.response;
  const reportId = String((await ctx.params).reportId ?? "").trim();
  if (!reportId) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const [report, actions] = await Promise.all([
    loadAdminReportById(admin.sb, reportId),
    loadAdminReportActions(admin.sb, reportId),
  ]);
  if (!report) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, report, actions });
}
