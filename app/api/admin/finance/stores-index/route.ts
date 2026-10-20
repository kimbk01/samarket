import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadFinanceStoresIndex } from "@/lib/finance/store-index/load-finance-stores-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/finance/stores-index?period=30d&limit=&offset= — period aggregates from StoreStatement.
 * R7 — 활동 매장 전체를 서버 페이지로 (RPC `admin_finance_store_activity_page`): limit 기본 24 · 최대 100, offset.
 * 응답 `{ ok, periodKey, fromIso, toIso, rows, total, limit, offset }` (예전 키 유지 + total/limit/offset).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const period = url.searchParams.get("period")?.trim() || "30d";
  const limitRaw = Number(url.searchParams.get("limit") || 24);
  const limitStores = Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 24;
  const offsetRaw = Number(url.searchParams.get("offset") || 0);
  const offset = Number.isFinite(offsetRaw) ? Math.trunc(offsetRaw) : 0;

  try {
    const result = await loadFinanceStoresIndex(gate.sb, { period, limitStores, offset });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "load_failed" },
      { status: 500 }
    );
  }
}
