import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  BUSINESS_CASH_CHARGE_REQUESTS_TABLE,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import {
  listBusinessCashLedgerForStore,
  listEconomicPointLedgerForStore,
  loadStoreBusinessCashBalance,
  loadStoreEconomicPointsBalance,
} from "@/lib/stores/advertising/canonical-business-cash-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/store-finance?storeId= — canonical Coin/Cash read surface. */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const storeId = String(req.nextUrl.searchParams.get("storeId") ?? "").trim();
  if (!storeId) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  const [store, coin, cash, coinLedger, cashLedger, topUps, obligations] =
    await Promise.all([
      gate.sb.from("stores").select("id, store_name").eq("id", storeId).maybeSingle(),
      loadStoreEconomicPointsBalance(gate.sb, storeId),
      loadStoreBusinessCashBalance(gate.sb, storeId),
      listEconomicPointLedgerForStore(gate.sb, storeId),
      listBusinessCashLedgerForStore(gate.sb, storeId),
      gate.sb
        .from(BUSINESS_CASH_CHARGE_REQUESTS_TABLE)
        .select("id, amount_minor, status, created_at, decided_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(20),
      gate.sb
        .from("store_sale_fee_obligations")
        .select("id, order_id, fee_outstanding_minor, status, created_at")
        .eq("store_id", storeId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  if (store.error || !store.data) {
    return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  }

  const obligationRows = obligations.error ? [] : obligations.data ?? [];
  return NextResponse.json({
    ok: true,
    store: {
      id: String(store.data.id),
      name: String(store.data.store_name ?? ""),
    },
    coin: { balance: coin.balance, ledger: coinLedger },
    cash: {
      balanceMinor: cash.balanceMinor,
      currency: cash.currency,
      ledger: cashLedger,
      topUps: topUps.error ? [] : topUps.data ?? [],
      obligations: {
        outstandingMinor: obligationRows.reduce(
          (sum, row) => sum + Math.trunc(Number(row.fee_outstanding_minor) || 0),
          0
        ),
        rows: obligationRows,
      },
    },
  });
}
