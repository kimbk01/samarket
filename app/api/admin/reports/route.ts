import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadAdminReportsList } from "@/lib/admin-reports/admin-reports-read.server";
import {
  isAdminReportsPageRequest,
  loadAdminUnifiedReportsPage,
  parseAdminReportsPageQuery,
} from "@/lib/admin-reports/admin-reports-unified-page.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reports — 통합 신고 목록 (거래 Admin 설계 v2 D-42 · D-43). 권한 키 `reports` + 서비스 롤 서버 조회.
 * - 페이지 모드 (`limit`/`offset` 이 있을 때, R7): 거래 신고 + 커뮤니티 신고(커뮤니티 신고 처리 권한도 같은 `reports` 키)를
 *   DB 에서 합쳐 필터·정렬·페이지 — query: domain(trade|community) · status · target_type · reason · target · limit(≤100) · offset.
 *   응답 `{ ok, reports, total, limit, offset }` (total = 정확한 전체 건수).
 * - 예전 모드 (파라미터 없음): 거래 신고 목록 `{ ok, reports }` 그대로.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminPermission("reports");
  if (!admin.ok) return admin.response;
  const sp = req.nextUrl.searchParams;
  try {
    if (isAdminReportsPageRequest(sp)) {
      const page = await loadAdminUnifiedReportsPage(admin.sb, parseAdminReportsPageQuery(sp));
      return NextResponse.json({ ok: true, ...page });
    }
    const reports = await loadAdminReportsList(admin.sb);
    return NextResponse.json({ ok: true, reports });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "reports_load_failed" },
      { status: 500 }
    );
  }
}
