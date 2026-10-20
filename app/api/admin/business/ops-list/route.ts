import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import {
  loadAdminBusinessListOps,
  parseAdminBusinessListOpsFilters,
} from "@/lib/admin-business/load-admin-business-list";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/business/ops-list — 운영 관제 목록 (pagination + KPI) */
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
  const result = await loadAdminBusinessListOps(sb, parseAdminBusinessListOpsFilters(searchParams));

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
