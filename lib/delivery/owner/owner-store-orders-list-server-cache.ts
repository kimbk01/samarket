/**
 * GET /api/me/stores/[storeId]/orders — process memory TTL + singleflight.
 * 클라이언트 `owner-store-orders-list-cache` 와 분리(서버 warm).
 */
import type { OwnerStoreOrdersListCacheValue } from "@/lib/delivery/owner/owner-store-orders-list-cache";
import { deliveryOwnerOrdersListCacheKey } from "@/lib/delivery/shared/contracts/delivery-order-cache-namespace";

const TTL_MS = 30_000;

type Entry = { expiresAt: number; value: OwnerStoreOrdersListCacheValue };

type OwnerOrdersListServerCacheGlobal = {
  __samarketOwnerStoreOrdersListServerCache?: Map<string, Entry>;
};

function cacheMap(): Map<string, Entry> {
  const g = globalThis as OwnerOrdersListServerCacheGlobal;
  if (!g.__samarketOwnerStoreOrdersListServerCache) {
    g.__samarketOwnerStoreOrdersListServerCache = new Map();
  }
  return g.__samarketOwnerStoreOrdersListServerCache;
}

function cacheKey(storeId: string, ownerUserId: string): string {
  return deliveryOwnerOrdersListCacheKey(storeId, ownerUserId);
}

export function peekOwnerStoreOrdersListServerCache(
  storeId: string,
  ownerUserId: string
): OwnerStoreOrdersListCacheValue | null {
  const k = cacheKey(storeId, ownerUserId);
  const row = cacheMap().get(k);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) cacheMap().delete(k);
    return null;
  }
  return row.value;
}

export function setOwnerStoreOrdersListServerCache(
  storeId: string,
  ownerUserId: string,
  value: OwnerStoreOrdersListCacheValue
): void {
  const k = cacheKey(storeId, ownerUserId);
  cacheMap().set(k, { value, expiresAt: Date.now() + TTL_MS });
  if (cacheMap().size > 80) {
    const now = Date.now();
    for (const [kk, v] of cacheMap()) {
      if (v.expiresAt <= now) cacheMap().delete(kk);
    }
  }
}

export function countOwnerStoreOrdersListServerCacheKeys(): number {
  return cacheMap().size;
}

export function invalidateOwnerStoreOrdersListServerCache(storeId?: string, ownerUserId?: string): number {
  const sid = storeId?.trim() ?? "";
  const uid = ownerUserId?.trim() ?? "";
  if (!sid && !uid) {
    const n = cacheMap().size;
    cacheMap().clear();
    return n;
  }
  if (sid && uid) {
    const k = cacheKey(sid, uid);
    const had = cacheMap().has(k) ? 1 : 0;
    cacheMap().delete(k);
    return had;
  }
  let removed = 0;
  for (const k of [...cacheMap().keys()]) {
    const ownerPrefix = "delivery-owner:orders:";
    const parts = k.startsWith(ownerPrefix) ? k.slice(ownerPrefix.length).split(":") : [];
    const keyStoreId = parts[0] ?? "";
    const keyOwnerUserId = parts.slice(1).join(":");
    if (uid && keyOwnerUserId === uid) {
      cacheMap().delete(k);
      removed++;
    } else if (sid && keyStoreId === sid) {
      cacheMap().delete(k);
      removed++;
    }
  }
  return removed;
}

