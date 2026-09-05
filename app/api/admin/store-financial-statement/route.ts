import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadStoreFinancialStatement } from "@/lib/admin/store-financial-statement/load-store-financial-statement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/store-financial-statement?storeId=&period=today|7d|30d|custom&from=&to=
 * Read-only composition of canonical Coin/Cash/settlement/obligation sources.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const storeId = String(req.nextUrl.searchParams.get("storeId") ?? "").trim();
  const period = req.nextUrl.searchParams.get("period");
  const fromDay = req.nextUrl.searchParams.get("from");
  const toDay = req.nextUrl.searchParams.get("to");

  const result = await loadStoreFinancialStatement(gate.sb, storeId, {
    period,
    fromDay,
    toDay,
  });

  if ("ok" in result && result.ok === false) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.httpStatus }
    );
  }

  return NextResponse.json({ ok: true, statement: result });
}
