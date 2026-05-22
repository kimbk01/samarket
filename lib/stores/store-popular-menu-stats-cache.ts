import type { SupabaseClient } from "@supabase/supabase-js";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  queryStorePopularMenuStats,
  type StorePopularMenuStatRow,
} from "@/lib/stores/query-store-popular-menu-stats";

const TTL_MS = 60_000;

const cache = new Map<
  string,
  { expiresAt: number; rows: StorePopularMenuStatRow[] }
>();

function cacheKey(storeId: string, windowDays: number, topN: number): string {
  return `${storeId.trim()}|${windowDays}|${topN}`;
}

export async function queryStorePopularMenuStatsCached(
  sb: SupabaseClient,
  storeId: string,
  windowDays: number,
  topN: number
): Promise<StorePopularMenuStatRow[]> {
  const k = cacheKey(storeId, windowDays, topN);
  const hit = cache.get(k);
  if (hit && hit.expiresAt > Date.now()) return hit.rows;

  return runSingleFlight(`store-popular-menu-stats:${k}`, async () => {
    const again = cache.get(k);
    if (again && again.expiresAt > Date.now()) return again.rows;
    const rows = await queryStorePopularMenuStats(sb, storeId, windowDays, topN);
    cache.set(k, { expiresAt: Date.now() + TTL_MS, rows });
    return rows;
  });
}

export function resetStorePopularMenuStatsCacheForTests(): void {
  cache.clear();
}
