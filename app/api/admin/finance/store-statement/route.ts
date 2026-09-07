import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadStoreStatement } from "@/lib/finance/store-statement/load-store-statement";
import { resolveStoreFinancialPeriod } from "@/lib/admin/store-financial-statement/load-store-financial-statement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/finance/store-statement?storeId=&period= */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId")?.trim() ?? "";
  if (!storeId) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const period = resolveStoreFinancialPeriod({
    period: url.searchParams.get("period"),
    fromDay: url.searchParams.get("fromDay"),
    toDay: url.searchParams.get("toDay"),
  });

  const statement = await loadStoreStatement(gate.sb, {
    storeId,
    fromIso: period.fromIso,
    toIso: period.toIso,
  });
  if (!statement) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, statement, period });
}
