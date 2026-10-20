import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { parseCommunityAdminPeriodFromSearch } from "@/lib/admin/community-admin/community-admin-period";
import { parseTradeAdminListPage } from "@/lib/admin/trade-admin/trade-admin-list-page";
import { isMissingRpcError } from "@/lib/admin/community-admin/community-admin-read-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RegionStatsRpc = { ok?: boolean; error?: string; total?: number; post_total?: number; rows?: unknown[] };

/**
 * GET /api/admin/trade/regions — 지역(시·군 LGU)별 거래 현황 (설계 v2 §C-11, 읽기 전용)
 * 집계 = DB RPC `admin_trade_region_stats` (기간 내 거래글 전체 — 예전 5000건 메모리 집계·413 제거).
 * 지역 판정: trade_lgu_id, 없으면 레거시 region/city 를 기존 매핑 테이블로 읽기 시점에만 환산 (데이터 변경 없음).
 * 사용자 앱 노출 순서(내 지역 → 주변 → 전국)·배달 반경과 무관.
 * query: period/from/to (게시물 등록일, 기본 전체) · limit(20/50/100)·offset — `limit` 이 있을 때만 서버 페이지.
 *        `limit` 이 없으면 지역 행 전체 (거래글 화면 지역 선택 목록 — 기존 호출자 호환).
 * 응답: { ok, total(지역 행 수), post_total(기간 내 거래글 수), limit?, offset?, rows } — 거래글 많은 순 → lgu_id.
 */
export async function GET(req: NextRequest) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const sb = admin.sb;
  const sp = req.nextUrl.searchParams;
  const period = parseCommunityAdminPeriodFromSearch(sp, { defaultPeriod: "all" });
  if (!period.ok) return NextResponse.json({ ok: false, error: period.error }, { status: 400 });
  const paged = sp.has("limit");
  const page = paged ? parseTradeAdminListPage(sp) : null;

  const { data, error } = await sb.rpc("admin_trade_region_stats", {
    p_from: period.fromIso,
    p_to: period.toIso,
    p_limit: page ? page.limit : null,
    p_offset: page ? page.offset : 0,
  });
  if (error) {
    if (isMissingRpcError(error)) {
      return NextResponse.json({ ok: false, error: "rpc_missing", rpc: "admin_trade_region_stats" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const res = (data ?? {}) as RegionStatsRpc;
  if (res.ok !== true) return NextResponse.json({ ok: false, error: res.error ?? "region_stats_failed" }, { status: 500 });
  const rows = Array.isArray(res.rows) ? res.rows : [];
  return NextResponse.json({
    ok: true,
    total: typeof res.total === "number" ? res.total : rows.length,
    post_total: typeof res.post_total === "number" ? res.post_total : null,
    ...(page ? { limit: page.limit, offset: page.offset } : {}),
    rows,
  });
}
