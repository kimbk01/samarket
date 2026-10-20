import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { parseCommunityAdminPeriodFromSearch } from "@/lib/admin/community-admin/community-admin-period";
import { loadTradeOverview } from "@/lib/admin/trade-admin/trade-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/trade/overview — 거래 대시보드 (설계 v2 §E)
 * query: period=today|7d|30d|custom (+from,to — 필리핀 날짜, 둘 다 포함). 기본 7d.
 * 처리 대기·현재 상태는 기간과 무관, 기간 통계만 [from, to) 로 다시 계산한다.
 */
export async function GET(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const period = parseCommunityAdminPeriodFromSearch(req.nextUrl.searchParams, { defaultPeriod: "7d" });
  if (!period.ok) return NextResponse.json({ ok: false, error: period.error }, { status: 400 });
  const overview = await loadTradeOverview(admin.sb, {
    fromIso: period.fromIso,
    toIso: period.toIso,
    fromDate: period.fromDate,
    toDate: period.toDate,
  });
  return NextResponse.json({ ok: true, periodKind: period.period, ...overview });
}
