import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadStoreCashLedgerPage } from "@/lib/stores/commission/load-store-commission-ledger";
import { parseStoreCommissionLedgerQuery } from "@/lib/stores/commission/store-commission-ledger-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 관리자: 매장 캐시 거래 원장 (충전·차감·정산·환급·광고) — Owner 와 같은 SQL 함수. */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const q = parseStoreCommissionLedgerQuery(req.nextUrl.searchParams);
  try {
    const page = await loadStoreCashLedgerPage(gate.sb, {
      storeIds: q.storeId ? [q.storeId] : null,
      fromIso: q.fromIso,
      toIso: q.toIso,
      kinds: q.kinds,
      limit: q.limit,
      offset: q.offset,
    });
    return NextResponse.json({
      ok: true,
      period: { period: q.period, fromIso: q.fromIso, toIso: q.toIso, timezone: "UTC" },
      ...page,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "load_failed";
    console.error("[admin/store-commission-ledger/cash-ledger]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
