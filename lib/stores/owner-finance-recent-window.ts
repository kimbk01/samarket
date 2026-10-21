/**
 * Owner Store Finance read helpers (M-19 / F-15).
 *
 * - Open sale-fee obligation totals come from SQL `store_cash_position` over ALL open rows (FIN-11; not the 20-row list).
 * - Coin "recent window" sums are computed server-side over EXACTLY the ledger rows returned
 *   to the client (N most recent). No calendar period is invented.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** FIN-11 — single SQL source shared with the settlement / admin screens. */
export const STORE_CASH_POSITION_RPC = "store_cash_position" as const;

export type OpenSaleFeeAggregate =
  | { ok: true; outstandingMinor: number; openCount: number | null }
  | { ok: false; error: string };

/**
 * Open sale-fee totals for one store from `public.store_cash_position(p_store_id)` (FIN-11):
 * outstandingMinor = SUM(fee_outstanding_minor), openCount = COUNT(*) WHERE status='open' — both computed in SQL.
 * `openCount` is null only when the DB predates the `open_count` key (20270603110300); callers fall back to the list.
 */
export async function loadOpenSaleFeeTotalsFromCashPosition(
  sb: SupabaseClient,
  storeId: string
): Promise<OpenSaleFeeAggregate> {
  const sid = storeId.trim();
  if (!sid) return { ok: false, error: "missing_store_id" };
  const { data, error } = await sb.rpc(STORE_CASH_POSITION_RPC, { p_store_id: sid });
  if (error) return { ok: false, error: error.message };
  const pos = (data ?? null) as Record<string, unknown> | null;
  if (!pos || pos.outstanding_minor == null) return { ok: false, error: "store_cash_position_empty" };
  return {
    ok: true,
    outstandingMinor: Math.trunc(Number(pos.outstanding_minor) || 0),
    openCount: pos.open_count == null ? null : Math.max(0, Math.trunc(Number(pos.open_count) || 0)),
  };
}

export type CoinRecentWindowSums = {
  /** Number of ledger rows the sums are computed over (same rows returned to the client). */
  rowCount: number;
  /** SUM(amount) WHERE entry_kind IN ('SALE_EARN','GIFT_REDEMPTION_EARN'). */
  earned: number;
  /** -SUM(amount) WHERE entry_kind = 'CONVERT_TO_BUSINESS_CASH'. */
  converted: number;
  /**
   * Net withdrawn: -SUM(WITHDRAWAL_REQUEST) - SUM(WITHDRAWAL_RELEASE).
   * A rejected request (REQUEST then RELEASE) nets to 0 — never counted as withdrawn.
   */
  withdrawn: number;
  /** -SUM(amount) WHERE entry_kind = 'REVERSAL'. */
  reversed: number;
};

export function computeCoinLedgerRecentWindowSums(
  rows: ReadonlyArray<{ entryKind: string; amount: number }>
): CoinRecentWindowSums {
  let earned = 0;
  let convertSum = 0;
  let withdrawalRequestSum = 0;
  let withdrawalReleaseSum = 0;
  let reversalSum = 0;
  for (const r of rows) {
    const amt = Math.trunc(Number(r.amount) || 0);
    switch (r.entryKind) {
      case "SALE_EARN":
      case "GIFT_REDEMPTION_EARN":
        earned += amt;
        break;
      case "CONVERT_TO_BUSINESS_CASH":
        convertSum += amt;
        break;
      case "WITHDRAWAL_REQUEST":
        withdrawalRequestSum += amt;
        break;
      case "WITHDRAWAL_RELEASE":
        withdrawalReleaseSum += amt;
        break;
      case "REVERSAL":
        reversalSum += amt;
        break;
      default:
        break;
    }
  }
  return {
    rowCount: rows.length,
    earned,
    // `|| 0` normalises -0 for JSON / equality.
    converted: -convertSum || 0,
    withdrawn: -withdrawalRequestSum - withdrawalReleaseSum || 0,
    reversed: -reversalSum || 0,
  };
}
