import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadFinanceStoresIndex } from "@/lib/finance/store-index/load-finance-stores-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/finance/stores-index?period=30d — period aggregates from StoreStatement */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const period = url.searchParams.get("period")?.trim() || "30d";
  const limitRaw = Number(url.searchParams.get("limit") || 24);
  const limitStores = Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 24;

  try {
    const result = await loadFinanceStoresIndex(gate.sb, { period, limitStores });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "load_failed" },
      { status: 500 }
    );
  }
}
