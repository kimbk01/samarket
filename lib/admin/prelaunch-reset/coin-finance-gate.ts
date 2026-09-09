/**
 * Prelaunch Reset — COIN finance gate (CUT 1).
 * Canonical authority = Currency SSOT COIN (`store_economic_point_*`).
 * Phantom `business_coin_*` must never be queried as finance protection.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CURRENCY_AUTHORITY } from "@/lib/currency/currency-ssot-hard-lock";

export const PRELAUNCH_RESET_COIN_LEDGER_TABLE = CURRENCY_AUTHORITY.COIN.ledgerTable;
export const PRELAUNCH_RESET_COIN_ACCOUNT_TABLE = CURRENCY_AUTHORITY.COIN.balanceTable;

/** Names that must not be used as Coin finance authority in Prelaunch Reset. */
export const PRELAUNCH_RESET_COIN_PHANTOM_TABLES = [
  "business_coin_ledger",
  "business_coin_accounts",
] as const;

export const COIN_FINANCE_UNREADABLE_BLOCKER = "coin_finance_authority_unreadable" as const;

/**
 * Count canonical Coin ledger rows for selected stores.
 * Query error → `{ n: 0, error }` — caller MUST fail-closed (never treat as SAFE).
 */
export async function countCanonicalCoinFinanceRows(
  sb: SupabaseClient,
  storeIds: string[]
): Promise<{ n: number; error?: string }> {
  if (storeIds.length === 0) return { n: 0 };
  const table = PRELAUNCH_RESET_COIN_LEDGER_TABLE;
  const { count, error } = await sb
    .from(table)
    .select("*", { count: "exact", head: true })
    .in("store_id", storeIds);
  if (error) return { n: 0, error: `${table}:${error.message}` };
  return { n: count ?? 0 };
}

/** Map Coin count result → finance delta + optional fail-closed blocker. */
export function resolveCoinFinanceGate(result: { n: number; error?: string }): {
  financeDelta: number;
  blocker: typeof COIN_FINANCE_UNREADABLE_BLOCKER | null;
  guard: string | null;
} {
  if (result.error) {
    return {
      financeDelta: 0,
      blocker: COIN_FINANCE_UNREADABLE_BLOCKER,
      guard: `coin_query_error=${result.error}`,
    };
  }
  return {
    financeDelta: result.n,
    blocker: null,
    guard: result.n > 0 ? `coin_ledger_rows=${result.n}` : null,
  };
}
