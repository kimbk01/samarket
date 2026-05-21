import type { SupabaseClient } from "@supabase/supabase-js";
import { mapBuyerUserIdsToPublicLabels } from "@/lib/stores/buyer-public-label";

const TTL_MS = 60_000;

type Entry = { expiresAt: number; labels: Record<string, string> };

type BuyerLabelCacheGlobal = {
  __samarketBuyerPublicLabelCache?: Map<string, Entry>;
};

function cacheMap(): Map<string, Entry> {
  const g = globalThis as BuyerLabelCacheGlobal;
  if (!g.__samarketBuyerPublicLabelCache) {
    g.__samarketBuyerPublicLabelCache = new Map();
  }
  return g.__samarketBuyerPublicLabelCache;
}

function cacheKey(buyerIds: string[]): string {
  return [...new Set(buyerIds.map((id) => id.trim()).filter(Boolean))].sort().join(",");
}

export async function mapBuyerUserIdsToPublicLabelsCached(
  sb: SupabaseClient<any>,
  buyerIds: string[]
): Promise<{ labels: Record<string, string>; cache_hit: boolean }> {
  const unique = [...new Set(buyerIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (!unique.length) return { labels: {}, cache_hit: false };
  const k = cacheKey(unique);
  const row = cacheMap().get(k);
  if (row && row.expiresAt > Date.now()) {
    return { labels: row.labels, cache_hit: true };
  }
  const labels = await mapBuyerUserIdsToPublicLabels(sb, unique);
  cacheMap().set(k, { labels, expiresAt: Date.now() + TTL_MS });
  if (cacheMap().size > 200) {
    const now = Date.now();
    for (const [kk, v] of cacheMap()) {
      if (v.expiresAt <= now) cacheMap().delete(kk);
    }
  }
  return { labels, cache_hit: false };
}
