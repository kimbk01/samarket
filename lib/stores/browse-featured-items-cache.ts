import type { BrowseFeaturedItemDto } from "@/lib/stores/browse-featured-items-types";

/** 서버 메모리 — storeId 키, TTL 45s */
export const BROWSE_FEATURED_ITEMS_SERVER_CACHE_TTL_MS = 45_000;

const cache = new Map<string, { expiresAt: number; items: BrowseFeaturedItemDto[] }>();

export function browseFeaturedItemsCacheKey(storeId: string): string {
  return `featured-items:${storeId.trim()}`;
}

export function peekBrowseFeaturedItemsServerCache(
  storeId: string
): BrowseFeaturedItemDto[] | undefined {
  const k = browseFeaturedItemsCacheKey(storeId);
  const row = cache.get(k);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) cache.delete(k);
    return undefined;
  }
  return row.items.map((x) => ({ ...x }));
}

export function clearBrowseFeaturedItemsServerCacheForStore(storeId: string): void {
  cache.delete(browseFeaturedItemsCacheKey(storeId));
}

export function setBrowseFeaturedItemsServerCache(
  storeId: string,
  items: BrowseFeaturedItemDto[]
): void {
  const k = browseFeaturedItemsCacheKey(storeId);
  cache.set(k, { expiresAt: Date.now() + BROWSE_FEATURED_ITEMS_SERVER_CACHE_TTL_MS, items });
  if (cache.size > 500) {
    const now = Date.now();
    for (const [key, v] of cache) {
      if (v.expiresAt <= now) cache.delete(key);
    }
  }
}
