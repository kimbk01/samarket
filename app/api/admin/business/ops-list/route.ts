import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import {
  loadAdminBusinessListOps,
  loadAdminBusinessListSelectAllIds,
  parseAdminBusinessListOpsFilters,
} from "@/lib/admin-business/load-admin-business-list";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/business/ops-list — 운영 관제 목록 (pagination + KPI · 유형/노출 필터 · `select_all=1` 전체 결과 id) */
export async function GET(req: Request) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  // 필터 해석 = 통합 대시보드 「영업 중 매장」과 같은 함수 (parseAdminBusinessListOpsFilters)
  const filters = parseAdminBusinessListOpsFilters(searchParams);

  // 5-A AB-03 — `select_all=1`: 같은 조건의 전체 결과 id (상한 ADMIN_BUSINESS_SELECT_ALL_MAX, 페이지 무관)
  if (filters.selectAll) {
    const all = await loadAdminBusinessListSelectAllIds(sb, filters);
    if (!all.ok) return NextResponse.json({ ok: false, error: all.error }, { status: 500 });
    return NextResponse.json({
      ok: true,
      ids: all.ids,
      total: all.total,
      truncated: all.truncated,
      max: all.max,
    });
  }

  const result = await loadAdminBusinessListOps(sb, filters);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    stores: result.stores,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    kpi: result.kpi,
    filterOptions: result.filterOptions,
  });
}
