/**
 * Admin Finance stores index — compose existing StoreStatement + recent unified txs.
 * No new ledger/writer; exposes period Gross/Fee/Coin/Cash from canonical loaders.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStoreFinancialPeriod } from "@/lib/admin/store-financial-statement/load-store-financial-statement";
import { loadStoreStatement } from "@/lib/finance/store-statement/load-store-statement";
import { loadUnifiedFinanceTransactions } from "@/lib/finance/unified-transaction/load-unified-transactions";

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
  input?: { period?: string | null; limitStores?: number }
): Promise<{ periodKey: string; fromIso: string; toIso: string; rows: FinanceStoreIndexRow[] }> {
  const period = resolveStoreFinancialPeriod({ period: input?.period ?? "30d" });
  const limitStores = Math.min(Math.max(Math.trunc(Number(input?.limitStores) || 24), 1), 40);

  const txs = await loadUnifiedFinanceTransactions(sb, { limit: 120 });
  const map = new Map<
    string,
    { storeId: string; storeName: string; lastAt: string; sampleKinds: string[] }
  >();
  for (const tx of txs) {
    const sid = String(tx.storeId ?? "").trim();
    if (!sid) continue;
    const prev = map.get(sid);
    const at = tx.occurredAt || "";
    if (!prev) {
      map.set(sid, {
        storeId: sid,
        storeName: tx.storeName || sid.slice(0, 8),
        lastAt: at,
        sampleKinds: [tx.entryKind],
      });
      continue;
    }
    if (at && (!prev.lastAt || at > prev.lastAt)) prev.lastAt = at;
    if (prev.sampleKinds.length < 3 && !prev.sampleKinds.includes(tx.entryKind)) {
      prev.sampleKinds.push(tx.entryKind);
    }
    if (tx.storeName) prev.storeName = tx.storeName;
  }

  const seeds = Array.from(map.values())
    .sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)))
    .slice(0, limitStores);

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
  };
}
