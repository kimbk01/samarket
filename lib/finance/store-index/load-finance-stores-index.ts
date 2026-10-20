/**
 * Admin Finance stores index — compose existing StoreStatement + recent unified txs.
 * No new ledger/writer; exposes period Gross/Fee/Coin/Cash from canonical loaders.
 *
 * R7 — 예전엔 통합 거래 최신 120건에서 매장 24개만 뽑았다. 지금은 RPC `admin_finance_store_activity_page` 가
 * 현금·코인 원장 활동이 있는 전체 매장을 최근 활동 순(동률 시 매장 id)으로 페이지 + 정확한 total 을 돌려주고,
 * 기간 집계는 이 페이지 매장만 StoreStatement 로 읽는다 (supabase/migrations/20270601120100_r7_admin_finance_pages.sql).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStoreFinancialPeriod } from "@/lib/admin/store-financial-statement/load-store-financial-statement";
import { loadStoreStatement } from "@/lib/finance/store-statement/load-store-statement";
import { ADMIN_LIST_MAX_OFFSET } from "@/lib/admin/pagination/parse-admin-list-page";

export const ADMIN_FINANCE_STORE_ACTIVITY_PAGE_RPC = "admin_finance_store_activity_page" as const;
export const FINANCE_STORES_INDEX_MAX_LIMIT = 100;

export type FinanceStoreIndexRow = {
  storeId: string;
  storeName: string;
  lastAt: string | null;
  sampleKinds: string[];
  periodKey: string;
  fromIso: string;
  toIso: string;
  /** Period gross sales (PHP major) from StoreStatement / settlement facts */
  gross: number | null;
  /** Period fee due (PHP major) */
  feeDue: number | null;
  /** Period Coin earned */
  coinEarned: number | null;
  /** Cash closing balance (minor) */
  cashClosingMinor: number | null;
};

export async function loadFinanceStoresIndex(
  sb: SupabaseClient,
  input?: { period?: string | null; limitStores?: number; offset?: number }
): Promise<{
  periodKey: string;
  fromIso: string;
  toIso: string;
  rows: FinanceStoreIndexRow[];
  total: number;
  limit: number;
  offset: number;
}> {
  const period = resolveStoreFinancialPeriod({ period: input?.period ?? "30d" });
  const limit = Math.min(Math.max(Math.trunc(Number(input?.limitStores) || 24), 1), FINANCE_STORES_INDEX_MAX_LIMIT);
  const offset = Math.min(Math.max(Math.trunc(Number(input?.offset) || 0), 0), ADMIN_LIST_MAX_OFFSET);

  const { data, error } = await sb.rpc(ADMIN_FINANCE_STORE_ACTIVITY_PAGE_RPC, { p_limit: limit, p_offset: offset });
  if (error) throw new Error(error.message || "finance_stores_index_load_failed");
  const o = (data ?? {}) as { total?: unknown; rows?: unknown };
  const seeds = (Array.isArray(o.rows) ? (o.rows as Array<Record<string, unknown>>) : [])
    .map((r) => {
      const storeId = String(r.store_id ?? "").trim();
      return {
        storeId,
        storeName: String(r.store_name ?? "").trim() || storeId.slice(0, 8),
        lastAt: r.last_at == null ? "" : String(r.last_at),
        sampleKinds: Array.isArray(r.sample_kinds) ? (r.sample_kinds as unknown[]).map((k) => String(k)) : [],
      };
    })
    .filter((s) => Boolean(s.storeId));

  const statements = await Promise.all(
    seeds.map((s) =>
      loadStoreStatement(sb, {
        storeId: s.storeId,
        fromIso: period.fromIso,
        toIso: period.toIso,
      })
    )
  );

  const rows: FinanceStoreIndexRow[] = seeds.map((s, i) => {
    const st = statements[i];
    return {
      storeId: s.storeId,
      storeName: st?.storeName || s.storeName,
      lastAt: s.lastAt || null,
      sampleKinds: s.sampleKinds,
      periodKey: period.key,
      fromIso: period.fromIso,
      toIso: period.toIso,
      gross: st ? st.sales.gross : null,
      feeDue: st ? st.sales.settlementFee : null,
      coinEarned: st ? st.coin.earned : null,
      cashClosingMinor: st ? st.cash.closingMinor : null,
    };
  });

  return {
    periodKey: period.key,
    fromIso: period.fromIso,
    toIso: period.toIso,
    rows,
    total: Math.max(0, Math.trunc(Number(o.total) || 0)),
    limit,
    offset,
  };
}
