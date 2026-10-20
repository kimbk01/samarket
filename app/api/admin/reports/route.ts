import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadAdminReportsList } from "@/lib/admin-reports/admin-reports-read.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reports — 통합 신고 목록 (거래 Admin 설계 v2 D-42 · D-43).
 * 브라우저 RLS 직접 읽기 대신 권한 키 `reports` + 서비스 롤 서버 조회. 조회 범위·정렬은 기존과 같다.
 */
export async function GET() {
  const admin = await requireAdminPermission("reports");
  if (!admin.ok) return admin.response;
  try {
    const reports = await loadAdminReportsList(admin.sb);
    return NextResponse.json({ ok: true, reports });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "reports_load_failed" },
      { status: 500 }
    );
  }
}
