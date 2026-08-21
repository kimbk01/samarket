import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { loadAdminBusinessListOps } from "@/lib/admin-business/load-admin-business-list";
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
  const result = await loadAdminBusinessListOps(sb, {
    q: searchParams.get("q") ?? "",
    approval: searchParams.get("approval") ?? searchParams.get("status") ?? "all",
    openKind: searchParams.get("open") ?? "",
    orderable: (searchParams.get("orderable") as "yes" | "no" | "") || "",
    delivery: (searchParams.get("delivery") as "yes" | "no" | "") || "",
    settlement: (searchParams.get("settlement") as
    | "ok"
    | "needs_check"
    | "held"
    | "attention"
    | "") || "",
    report: (searchParams.get("report") as "open" | "none" | "") || "",
    restriction: (searchParams.get("restriction") as "yes" | "no" | "") || "",
    categoryId: searchParams.get("category_id") ?? "",
    region: searchParams.get("region") ?? "",
    page: Number(searchParams.get("page") || 1),
    pageSize: Number(searchParams.get("pageSize") || 20),
    sort: searchParams.get("sort") ?? "last_order",
  });

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
