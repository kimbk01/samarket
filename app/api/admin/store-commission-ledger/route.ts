import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  loadStoreCashOverview,
  loadStoreCommissionLedgerPage,
} from "@/lib/stores/commission/load-store-commission-ledger";
import { parseStoreCommissionLedgerQuery } from "@/lib/stores/commission/store-commission-ledger-query";
import { loadStoreCashOrderGateSetting } from "@/lib/stores/commission/store-commission-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 관리자: 매장 수수료 원장 + 매장별 캐시 현황.
 * Owner `/api/me/stores/[storeId]/commission-ledger` 와 같은 SQL 함수(store_commission_ledger_page).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const { sb } = gate;

  const q = parseStoreCommissionLedgerQuery(req.nextUrl.searchParams);
  try {
    let overviewIds: string[];
    if (q.storeId) {
      overviewIds = [q.storeId];
    } else {
      const [approved, accounts] = await Promise.all([
        sb.from("stores").select("id").eq("approval_status", "approved").limit(5000),
        sb.from("business_cash_accounts").select("store_id").limit(5000),
      ]);
      if (approved.error) throw new Error(approved.error.message);
      overviewIds = [
        ...new Set([
          ...(approved.data ?? []).map((s) => String(s.id)),
          ...(accounts.data ?? []).map((a) => String(a.store_id)),
        ]),
      ];
    }
    const [ledger, overview, gateSetting] = await Promise.all([
      loadStoreCommissionLedgerPage(sb, {
        storeIds: q.storeId ? [q.storeId] : null,
        fromIso: q.fromIso,
        toIso: q.toIso,
        state: q.state,
        orderNo: q.orderNo,
        limit: q.limit,
        offset: q.offset,
      }),
      loadStoreCashOverview(sb, overviewIds),
      loadStoreCashOrderGateSetting(sb),
    ]);
    return NextResponse.json({
      ok: true,
      gate: gateSetting,
      period: { period: q.period, fromIso: q.fromIso, toIso: q.toIso, timezone: "UTC" },
      ...overview,
      ...ledger,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "load_failed";
    console.error("[admin/store-commission-ledger]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
