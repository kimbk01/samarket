import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import {
  loadStoreCashOverview,
  loadStoreCommissionBreakdown,
  loadStoreCommissionLedgerPage,
  loadStorePlatformPayable,
} from "@/lib/stores/commission/load-store-commission-ledger";
import {
  parseStoreCommissionLedgerQuery,
  STORE_COMMISSION_TIMEZONE,
} from "@/lib/stores/commission/store-commission-ledger-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 매장 오너: 자기 매장 수수료 원장 — Admin 과 동일 SQL 함수, store_id 는 경로·소유 검증으로 고정. */
export async function GET(req: NextRequest, context: { params: Promise<{ storeId: string }> }) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const session = await validateActiveSession(userId);
  if (!session.ok) return session.response;

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const q = parseStoreCommissionLedgerQuery(req.nextUrl.searchParams);
  const scope = [sid];
  try {
    const [ledger, overview, breakdown, payable] = await Promise.all([
      loadStoreCommissionLedgerPage(sb, {
        storeIds: scope,
        fromIso: q.fromIso,
        toIso: q.toIso,
        state: q.state,
        orderNo: q.orderNo,
        limit: q.limit,
        offset: q.offset,
      }),
      loadStoreCashOverview(sb, scope),
      loadStoreCommissionBreakdown(sb, { storeIds: scope, fromIso: q.fromIso, toIso: q.toIso, group: q.group === "store" ? "day" : q.group }),
      loadStorePlatformPayable(sb, { storeIds: scope, fromIso: q.fromIso, toIso: q.toIso, view: "payable", limit: 1, offset: 0 }),
    ]);
    return NextResponse.json({
      ok: true,
      position: overview.positions[0] ?? null,
      period: { period: q.period, fromIso: q.fromIso, toIso: q.toIso, timezone: STORE_COMMISSION_TIMEZONE },
      breakdown: { group: q.group === "store" ? "day" : q.group, rows: breakdown },
      payableSummary: payable.summary,
      ...ledger,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "load_failed";
    console.error("[me/commission-ledger]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
