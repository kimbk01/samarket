import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STORE_POPULAR_PRODUCT_BATCH_LIMIT_MAX,
  STORE_POPULAR_PRODUCT_STATS_BATCH_RPC,
} from "@/lib/stores/store-popular-product-metric-contract";

export type StorePopularProductStatRow = {
  storeId: string;
  productId: string;
  totalQty: number;
  lastOrderedAt: string;
  popularRank: number;
};

export type StorePopularProductStatsLoadStatus = "ok" | "error";

export type StorePopularProductStatsLoadResult = {
  status: StorePopularProductStatsLoadStatus;
  byStoreId: Map<string, StorePopularProductStatRow[]>;
};

function clampLimitPerStore(limitPerStore: number): number {
  const n = Math.floor(limitPerStore);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(STORE_POPULAR_PRODUCT_BATCH_LIMIT_MAX, n));
}

function parseRpcRow(raw: Record<string, unknown>): StorePopularProductStatRow | null {
  const storeId = String(raw.store_id ?? "").trim();
  const productId = String(raw.product_id ?? "").trim();
  if (!storeId || !productId) return null;
  const popularRank = Math.floor(Number(raw.popular_rank));
  if (!Number.isFinite(popularRank) || popularRank < 1) return null;
  return {
    storeId,
    productId,
    totalQty: Math.max(0, Math.floor(Number(raw.total_qty) || 0)),
    lastOrderedAt: String(raw.last_ordered_at ?? ""),
    popularRank,
  };
}

export function normalizeStorePopularProductStatsByStore(
  storeIds: readonly string[],
  rows: readonly StorePopularProductStatRow[]
): Map<string, StorePopularProductStatRow[]> {
  const grouped = new Map<string, StorePopularProductStatRow[]>();
  for (const id of storeIds) {
    const sid = String(id).trim();
    if (!sid) continue;
    grouped.set(sid, []);
  }
  for (const row of rows) {
    const arr = grouped.get(row.storeId);
    if (!arr) continue;
    arr.push(row);
  }
  for (const [storeId, arr] of grouped) {
    arr.sort((a, b) => a.popularRank - b.popularRank);
    grouped.set(storeId, arr);
  }
  return grouped;
}

/**
 * One batch RPC — discovery paths must not N+1 per store.
 * On RPC failure: status=error, empty map (distinct from ok + empty per-store arrays).
 */
export async function loadStorePopularProductStatsBatch(
  sb: SupabaseClient,
  storeIds: readonly string[],
  opts: { since: string; limitPerStore: number }
): Promise<StorePopularProductStatsLoadResult> {
  const ids = [...new Set(storeIds.map((id) => String(id).trim()).filter(Boolean))];
  if (ids.length === 0) {
    return { status: "ok", byStoreId: new Map() };
  }

  const since = String(opts.since ?? "").trim();
  if (!since) {
    return { status: "error", byStoreId: new Map() };
  }

  const limitPerStore = clampLimitPerStore(opts.limitPerStore);

  const { data, error } = await sb.rpc(STORE_POPULAR_PRODUCT_STATS_BATCH_RPC, {
    p_store_ids: ids,
    p_since: since,
    p_limit_per_store: limitPerStore,
  });

  if (error) {
    if (!String(error.message || "").includes(STORE_POPULAR_PRODUCT_STATS_BATCH_RPC)) {
      console.error("[loadStorePopularProductStatsBatch]", error.message);
    }
    return { status: "error", byStoreId: new Map() };
  }

  const raw = Array.isArray(data) ? data : [];
  const parsed = raw
    .map((r) => parseRpcRow(r as Record<string, unknown>))
    .filter((r): r is StorePopularProductStatRow => r != null);

  return {
    status: "ok",
    byStoreId: normalizeStorePopularProductStatsByStore(ids, parsed),
  };
}
