/**
 * GET /api/admin/community/stats — 커뮤니티 운영 통계 (설계 §C-21 · §D-4). 읽기 전용, SQL 집계 1회.
 * query: period=today|7d|30d|custom (+from,to YYYY-MM-DD, 마닐라 · 최대 400일) — 기본 7d · format=csv(일별 추이)
 * → { ok, period, lastUpdatedAt, stats: AdminCommunityPeriodStats }  (stats 구조는 RPC admin_community_period_stats)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { parseCommunityAdminPeriodFromSearch } from "@/lib/admin/community-admin/community-admin-period";
import { communityPeriodError, communityReadError } from "@/lib/admin/community-admin/community-admin-read-server";
import {
  communityStatsDailyCsv,
  loadCommunityPeriodStats,
} from "@/lib/admin/metrics/load-community-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireCommunityAdmin("read");
  if (!gate.ok) return gate.response;
  const sp = req.nextUrl.searchParams;
  const period = parseCommunityAdminPeriodFromSearch(sp, { defaultPeriod: "7d" });
  if (!period.ok) return communityPeriodError(period.error);
  if (!period.fromIso || !period.toIso) return communityPeriodError("period_required");

  const res = await loadCommunityPeriodStats(gate.sb, period.fromIso, period.toIso);
  if (!res.ok) return communityReadError(res.error, res.error === "rpc_missing" ? 503 : 500);

  if (sp.get("format") === "csv") {
    const csv = communityStatsDailyCsv(res.stats);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="community-stats-${period.fromDate}_${period.toDate}.csv"`,
      },
    });
  }
  return NextResponse.json({
    ok: true,
    period: { period: period.period, from: period.fromDate, to: period.toDate, fromIso: period.fromIso, toIso: period.toIso },
    timezone: "Asia/Manila",
    lastUpdatedAt: new Date().toISOString(),
    stats: res.stats,
  });
}
