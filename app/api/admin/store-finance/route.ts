import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  BUSINESS_CASH_CHARGE_REQUESTS_TABLE,
  BUSINESS_CASH_LEDGER_TABLE,
} from "@/lib/stores/advertising/canonical-business-cash-contract";
import { buildCashLedgerIntegrityReport } from "@/lib/finance/cash-ledger-chain-integrity";

/** P0-6 — 무결성 검사에 읽는 원장 행 상한 (넘으면 truncated 로 표시, PASS 로 확정하지 않음). */
const CASH_INTEGRITY_MAX_ROWS = 5000;
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

  const [store, coin, cash, coinLedger, cashLedger, topUps, obligations, cashChain] =
    await Promise.all([
      gate.sb.from("stores").select("id, store_name").eq("id", storeId).maybeSingle(),
      loadStoreEconomicPointsBalance(gate.sb, storeId),
      loadStoreBusinessCashBalance(gate.sb, storeId),
      // P1 — 관리자는 처리 주체·멱등 키까지 (사장님 API 는 그대로)
      listEconomicPointLedgerForStore(gate.sb, storeId, 100, { includeAudit: true }),
      listBusinessCashLedgerForStore(gate.sb, storeId, 100, { includeAudit: true }),
      gate.sb
        .from(BUSINESS_CASH_CHARGE_REQUESTS_TABLE)
        .select("id, amount_minor, status, created_at, decided_at, payment_method, payment_reference, proof_file_path, reject_reason")
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
      gate.sb
        .from(BUSINESS_CASH_LEDGER_TABLE)
        .select("id, entry_kind, direction, amount_minor, balance_after_minor, created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(CASH_INTEGRITY_MAX_ROWS + 1),
    ]);

  if (store.error || !store.data) {
    return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  }

  const obligationRows = obligations.error ? [] : obligations.data ?? [];
  // P0-6 — Cash 원장 연쇄·잔액 대조. 불일치는 FAIL 그대로 관리자에게 보인다 (과거 예외로 숨기지 않음).
  const chainRows = cashChain.error ? null : ((cashChain.data ?? []) as Array<Record<string, unknown>>);
  const cashIntegrity =
    chainRows == null
      ? { status: "UNAVAILABLE" as const, error: "ledger_read_failed" }
      : buildCashLedgerIntegrityReport({
          balanceMinor: cash.balanceMinor,
          truncated: chainRows.length > CASH_INTEGRITY_MAX_ROWS,
          rows: chainRows.slice(0, CASH_INTEGRITY_MAX_ROWS).map((r) => ({
            id: String(r.id ?? ""),
            entry_kind: String(r.entry_kind ?? ""),
            direction: String(r.direction ?? ""),
            amount_minor: Math.trunc(Number(r.amount_minor) || 0),
            balance_after_minor: Math.trunc(Number(r.balance_after_minor) || 0),
            created_at: String(r.created_at ?? ""),
          })),
        });
  return NextResponse.json({
    ok: true,
    store: {
      id: String(store.data.id),
      name: String(store.data.store_name ?? ""),
    },
    coin: { balance: coin.balance, ledger: coinLedger },
    cashIntegrity,
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
