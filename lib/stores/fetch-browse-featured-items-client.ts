"use client";

import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  mapFeaturedDtoToCardItems,
  type BrowseFeaturedCardItem,
  type BrowseFeaturedItemsByStoreDto,
} from "@/lib/stores/browse-featured-items-types";

const CLIENT_TTL_MS = 30_000;

const memoryByStoreId = new Map<
  string,
  { expiresAt: number; items: BrowseFeaturedCardItem[] }
>();

function sortedFlightKey(storeIds: string[]): string {
  return [...storeIds].sort().join(",");
}

function peekClientFeatured(storeId: string): BrowseFeaturedCardItem[] | undefined {
  const row = memoryByStoreId.get(storeId);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) memoryByStoreId.delete(storeId);
    return undefined;
  }
  return row.items.map((x) => ({ ...x }));
}

function setClientFeatured(storeId: string, items: BrowseFeaturedCardItem[]): void {
  memoryByStoreId.set(storeId, { expiresAt: Date.now() + CLIENT_TTL_MS, items });
}

export type FetchBrowseFeaturedBatchResult = {
  byStoreId: Map<string, BrowseFeaturedCardItem[]>;
  cacheHits: number;
};

/**
 * 배치 1회 — 동일 storeId 집합 singleflight + storeId별 30s 메모리 캐시.
 */
export async function fetchBrowseFeaturedItemsBatch(
  storeIds: string[]
): Promise<FetchBrowseFeaturedBatchResult> {
  const unique = [...new Set(storeIds.map((id) => id.trim()).filter(Boolean))];
  const byStoreId = new Map<string, BrowseFeaturedCardItem[]>();
  const toFetch: string[] = [];
  let cacheHits = 0;

  for (const id of unique) {
    const hit = peekClientFeatured(id);
    if (hit !== undefined) {
      cacheHits += 1;
      byStoreId.set(id, hit);
    } else {
      toFetch.push(id);
    }
  }

  if (toFetch.length === 0) {
    return { byStoreId, cacheHits };
  }

  const flightKey = `stores:browse-featured-items:${sortedFlightKey(toFetch)}`;
  const fetched = await runSingleFlight(flightKey, async () => {
    const stillMiss: string[] = [];
    const map = new Map<string, BrowseFeaturedCardItem[]>();
    for (const id of toFetch) {
      const hit = peekClientFeatured(id);
      if (hit !== undefined) {
        map.set(id, hit);
      } else {
        stillMiss.push(id);
      }
    }
    if (stillMiss.length === 0) {
      return map;
    }
    const qs = new URLSearchParams({ storeIds: stillMiss.join(",") });
    const res = await fetch(`/api/stores/browse-featured-items?${qs.toString()}`, {
      credentials: "include",
      cache: "no-store",
      headers: { "x-samarket-surface": "browse_deferred" },
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      items?: Record<string, BrowseFeaturedItemsByStoreDto>;
    };
    /** DO NOT cache empty featured items on fetch failure — 30s poison causes stuck placeholders. */
    if (!res.ok || !json?.ok || !json.items) {
      for (const id of stillMiss) {
        map.set(id, []);
      }
      return map;
    }
    for (const id of stillMiss) {
      const items = mapFeaturedDtoToCardItems(json.items[id]?.featuredItems);
      setClientFeatured(id, items);
      map.set(id, items);
    }
    return map;
  });

  for (const [id, items] of fetched) {
    byStoreId.set(id, items);
  }
  for (const id of toFetch) {
    if (!byStoreId.has(id)) {
      byStoreId.set(id, []);
    }
  }

  return { byStoreId, cacheHits };
}

export function peekBrowseFeaturedItemsClient(storeId: string): BrowseFeaturedCardItem[] | undefined {
  return peekClientFeatured(storeId);
}

export function clearBrowseFeaturedItemsClientCache(): void {
  memoryByStoreId.clear();
}
