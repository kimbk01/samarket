/**
 * Owner Store Finance read helpers (M-19 / F-15).
 *
 * - Open sale-fee obligation totals are aggregated over ALL open rows (not the 20-row list).
 * - Coin "recent window" sums are computed server-side over EXACTLY the ledger rows returned
 *   to the client (N most recent). No calendar period is invented.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const STORE_SALE_FEE_OBLIGATIONS_TABLE = "store_sale_fee_obligations" as const;

const AGGREGATE_PAGE_SIZE = 1000;
/** Hard stop against runaway loops (1000 × 1000 rows). */
const AGGREGATE_MAX_PAGES = 1000;

export type OpenSaleFeeAggregate =
  | { ok: true; outstandingMinor: number; openCount: number }
  | { ok: false; error: string };

/**
 * Unlimited aggregate over open obligations for one store:
 * outstandingMinor = SUM(fee_outstanding_minor), openCount = COUNT(*) WHERE status='open'.
 * Pages through rows (PostgREST max-rows safe) selecting only the summed column.
 */
export async function aggregateOpenSaleFeeObligations(
  sb: SupabaseClient,
  storeId: string
): Promise<OpenSaleFeeAggregate> {
  const sid = storeId.trim();
  if (!sid) return { ok: false, error: "missing_store_id" };

  const { count, error: countErr } = await sb
    .from(STORE_SALE_FEE_OBLIGATIONS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .eq("status", "open");
  if (countErr) return { ok: false, error: countErr.message };

  let outstandingMinor = 0;
  for (let page = 0; page < AGGREGATE_MAX_PAGES; page += 1) {
    const from = page * AGGREGATE_PAGE_SIZE;
    const { data, error } = await sb
      .from(STORE_SALE_FEE_OBLIGATIONS_TABLE)
      .select("id, fee_outstanding_minor")
      .eq("store_id", sid)
      .eq("status", "open")
      .order("id", { ascending: true })
      .range(from, from + AGGREGATE_PAGE_SIZE - 1);
    if (error) return { ok: false, error: error.message };
    const rows = (data ?? []) as Array<{ fee_outstanding_minor?: number | string | null }>;
    for (const r of rows) {
      outstandingMinor += Math.trunc(Number(r.fee_outstanding_minor) || 0);
    }
    if (rows.length < AGGREGATE_PAGE_SIZE) break;
  }

  return { ok: true, outstandingMinor, openCount: Math.max(0, Math.trunc(Number(count) || 0)) };
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
