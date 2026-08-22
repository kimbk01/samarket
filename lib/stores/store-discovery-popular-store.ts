import type { SupabaseClient } from "@supabase/supabase-js";
import {
  compareStoreDiscoveryEligibilityRank,
  type StoreDiscoveryEligibilityInput,
  resolveStoreDiscoveryEligibility,
} from "@/lib/stores/store-discovery-eligibility";
import type { StoreDiscoverySortRow } from "@/lib/stores/store-discovery-browse-sort";

/**
 * P1-A Popular Store SSOT window — single authority (no admin setting in this cut).
 */
export const STORE_POPULARITY_WINDOW_DAYS = 30;

/**
 * TIME AUTHORITY (PARTIAL):
 * `store_orders` has no `completed_at` / terminal completion timestamp.
 * Window filter uses `store_orders.created_at`.
 * Product metric: completed orders **created** within the last N days — not completion instant.
 */
export const STORE_POPULARITY_TIME_FIELD = "created_at" as const;

export type StorePopularityMetric = {
  storeId: string;
  completedOrderCount30d: number;
};

export type StorePopularitySortRow = StoreDiscoverySortRow & {
  completedOrderCount30d?: number;
};

export function resolveStorePopularitySinceIso(now = new Date()): string {
  const ms = STORE_POPULARITY_WINDOW_DAYS * 86_400_000;
  return new Date(now.getTime() - ms).toISOString();
}

export function normalizeStoreCompletedOrderCountMap(
  storeIds: readonly string[],
  rows: readonly { store_id: string; completed_order_count: number }[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = String(row.store_id ?? "").trim();
    if (!id) continue;
    counts.set(id, Math.max(0, Math.floor(Number(row.completed_order_count) || 0)));
  }
  const out = new Map<string, number>();
  for (const id of storeIds) {
    const sid = String(id).trim();
    if (!sid) continue;
    out.set(sid, counts.get(sid) ?? 0);
  }
  return out;
}

/**
 * One batch RPC — N+1 forbidden for discovery paths.
 */
export async function loadStoreCompletedOrderCount30dMap(
  sb: SupabaseClient,
  storeIds: readonly string[],
  opts?: { sinceIso?: string; now?: Date }
): Promise<Map<string, number>> {
  const ids = [...new Set(storeIds.map((id) => String(id).trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const since = opts?.sinceIso ?? resolveStorePopularitySinceIso(opts?.now ?? new Date());

  const { data, error } = await sb.rpc("get_store_completed_order_counts", {
    p_store_ids: ids,
    p_since: since,
  });

  if (error) {
    if (!String(error.message || "").includes("get_store_completed_order_counts")) {
      console.error("[loadStoreCompletedOrderCount30dMap]", error.message);
    }
    return normalizeStoreCompletedOrderCountMap(ids, []);
  }

  const raw = Array.isArray(data) ? data : [];
  const rows = raw
    .map((r: Record<string, unknown>) => ({
      store_id: String(r.store_id ?? ""),
      completed_order_count: Number(r.completed_order_count) || 0,
    }))
    .filter((r) => r.store_id.length > 0);

  return normalizeStoreCompletedOrderCountMap(ids, rows);
}

export function resolveStorePopularityEligibilityRank(input: StoreDiscoveryEligibilityInput): number {
  return resolveStoreDiscoveryEligibility(input).rank;
}

function canonicalPopularityCount(row: StorePopularitySortRow): number {
  const n = row.completedOrderCount30d ?? 0;
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function canonicalRatingValue(row: StoreDiscoverySortRow): number | null {
  if (row.rating_avg == null || !Number.isFinite(Number(row.rating_avg))) return null;
  return Number(row.rating_avg);
}

function canonicalReviewCount(row: StoreDiscoverySortRow): number {
  const n = row.review_count ?? 0;
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function stableSlug(a: StoreDiscoverySortRow, b: StoreDiscoverySortRow): number {
  const bySlug = String(a.slug ?? "").localeCompare(String(b.slug ?? ""));
  if (bySlug !== 0) return bySlug;
  return String(a.id).localeCompare(String(b.id));
}

/**
 * P0 eligibility → completedOrderCount30d DESC → rating → reviewCount → stable tie.
 */
export function compareStoreDiscoveryPopularRows(
  aRank: number,
  bRank: number,
  a: StorePopularitySortRow,
  b: StorePopularitySortRow
): number {
  const er = compareStoreDiscoveryEligibilityRank(aRank, bRank);
  if (er !== 0) return er;

  const pop = canonicalPopularityCount(b) - canonicalPopularityCount(a);
  if (pop !== 0) return pop;

  const ra = canonicalRatingValue(a);
  const rb = canonicalRatingValue(b);
  if (ra != null && rb != null && ra !== rb) return rb - ra;
  if (ra != null && rb == null) return -1;
  if (ra == null && rb != null) return 1;

  const rev = canonicalReviewCount(b) - canonicalReviewCount(a);
  if (rev !== 0) return rev;

  return stableSlug(a, b);
}

export function sortStoreDiscoveryPopularRows<T extends StorePopularitySortRow>(
  rows: T[],
  eligibilityRankById: Map<string, number>
): T[] {
  return [...rows].sort((a, b) => {
    const ar = eligibilityRankById.get(a.id) ?? 99;
    const br = eligibilityRankById.get(b.id) ?? 99;
    return compareStoreDiscoveryPopularRows(ar, br, a, b);
  });
}
