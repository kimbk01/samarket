import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadStoreStatement } from "@/lib/finance/store-statement/load-store-statement";
import { resolveStoreFinancialPeriod } from "@/lib/admin/store-financial-statement/load-store-financial-statement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/finance/store-statement?storeId=&period=&fromDay=&toDay=
 * R4-d — `period=custom` + `fromDay`/`toDay`(또는 `from`/`to`, PHT 날짜·둘 다 포함) 이면 그 기간.
 * 응답 `period.fromDay`·`period.toDay` = 포함 기간 (화면 목록·머리글이 그대로 쓴다).
 */
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

  const statement = await loadStoreStatement(gate.sb, {
    storeId,
    fromIso: period.fromIso,
    toIso: period.toIso,
  });
  if (!statement) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, statement, period });
}
