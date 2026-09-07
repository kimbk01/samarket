import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadDailyStatements } from "@/lib/finance/daily-statement/load-daily-statement";
import { resolveStoreFinancialPeriod } from "@/lib/admin/store-financial-statement/load-store-financial-statement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/finance/daily-statement?storeId=&period= */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId")?.trim() ?? "";
  if (!storeId) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const period = resolveStoreFinancialPeriod({
    period: url.searchParams.get("period"),
    fromDay: url.searchParams.get("fromDay") ?? url.searchParams.get("from"),
    toDay: url.searchParams.get("toDay") ?? url.searchParams.get("to"),
  });

  const rows = await loadDailyStatements(gate.sb, {
    storeId,
    fromIso: period.fromIso,
    toIso: period.toIso,
  });
  return NextResponse.json({ ok: true, rows, period });
}
