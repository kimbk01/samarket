import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  loadAdminStoreCashOverviewIds,
  loadStoreCashOverview,
  loadStoreCommissionBreakdown,
  loadStoreCommissionLedgerPage,
  loadStorePlatformPayable,
} from "@/lib/stores/commission/load-store-commission-ledger";
import {
  parseStoreCommissionLedgerQuery,
  STORE_COMMISSION_TIMEZONE,
} from "@/lib/stores/commission/store-commission-ledger-query";
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
    const overviewIds = q.storeId ? [q.storeId] : await loadAdminStoreCashOverviewIds(sb);
    const scope = q.storeId ? [q.storeId] : null;
    const [ledger, overview, gateSetting, breakdown, payable] = await Promise.all([
      loadStoreCommissionLedgerPage(sb, {
        storeIds: scope,
        fromIso: q.fromIso,
        toIso: q.toIso,
        state: q.state,
        orderNo: q.orderNo,
        limit: q.limit,
        offset: q.offset,
      }),
      loadStoreCashOverview(sb, overviewIds),
      loadStoreCashOrderGateSetting(sb),
      loadStoreCommissionBreakdown(sb, { storeIds: scope, fromIso: q.fromIso, toIso: q.toIso, group: q.group }),
      loadStorePlatformPayable(sb, { storeIds: scope, fromIso: q.fromIso, toIso: q.toIso, view: "payable", limit: 1, offset: 0 }),
    ]);
    return NextResponse.json({
      ok: true,
      gate: gateSetting,
      // B-2: 수수료 조정 결정은 super_admin 만 — 화면은 이 값으로 CTA 를 잠근다 (서버도 requireSuperAdmin).
      viewer: { can_decide_adjustment: gate.actor.isSuperAdmin },
      period: { period: q.period, fromIso: q.fromIso, toIso: q.toIso, timezone: STORE_COMMISSION_TIMEZONE },
      breakdown: { group: q.group, rows: breakdown },
      payableSummary: payable.summary,
      ...overview,
      ...ledger,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "load_failed";
    console.error("[admin/store-commission-ledger]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
