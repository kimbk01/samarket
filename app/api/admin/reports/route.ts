import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadAdminReportsList } from "@/lib/admin-reports/admin-reports-read.server";
import {
  isAdminReportsPageRequest,
  loadAdminUnifiedReportsCursorPage,
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
 * - 커서 모드 (`cursor` 파라미터 — 첫 쪽은 빈 값, RS-02): 원장 6종(거래·커뮤니티 + 매장·모임·메신저·구 거래 채팅 신고)을
 *   원장별 page+1 건으로 병합. 응답 = 위 필드 + `nextCursor` · `sourceCounts` · `includedSources` · `excludedSources` · `partial`.
 *   추가 4종은 조회만(행 `ledgerReadOnly` · `adminDetailHref` = 도메인 처리 화면). 원장별 열람 권한이 없으면 제외 + `partial`.
 * - 예전 모드 (파라미터 없음): 거래 신고 목록 `{ ok, reports }` 그대로.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminPermission("reports");
  if (!admin.ok) return admin.response;
  const sp = req.nextUrl.searchParams;
  try {
    if (isAdminReportsPageRequest(sp)) {
      const q = parseAdminReportsPageQuery(sp);
      if (q.cursorMode) {
        const page = await loadAdminUnifiedReportsCursorPage(admin.sb, q, admin.actor);
        return NextResponse.json({ ok: true, ...page });
      }
      const page = await loadAdminUnifiedReportsPage(admin.sb, q);
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
