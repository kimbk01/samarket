/**
 * Hub badge store_order_unread — store_orders room_id snapshot (participants query only on hit).
 * key: store-order-roomids:${storeId}
 */

const DEFAULT_TTL_MS = 10_000;

type MemoryEntry = {
  roomIds: string[];
  cachedAt: number;
  expiresAt: number;
};

const memoryByStoreId = new Map<string, MemoryEntry>();

export function hubStoreOrderRoomIdsMemoryTtlMs(): number {
  const raw = process.env.HUB_BADGE_STORE_ORDER_ROOMIDS_MEMORY_TTL_MS?.trim();
  const n = raw ? Number(raw) : DEFAULT_TTL_MS;
  if (!Number.isFinite(n) || n < 3_000) return DEFAULT_TTL_MS;
  return Math.min(30_000, Math.max(3_000, Math.floor(n)));
}

export function hubStoreOrderRoomIdsMemoryCacheKey(storeId: string): string {
  return `store-order-roomids:${storeId.trim()}`;
}

export function invalidateHubStoreOrderRoomIdsMemory(storeId?: string): void {
  const sid = storeId?.trim();
  if (!sid) {
    memoryByStoreId.clear();
    return;
  }
  memoryByStoreId.delete(hubStoreOrderRoomIdsMemoryCacheKey(sid));
}

function pruneExpired(now: number) {
  for (const [key, row] of memoryByStoreId) {
    if (row.expiresAt <= now) memoryByStoreId.delete(key);
  }
  while (memoryByStoreId.size > 500) {
    const first = memoryByStoreId.keys().next().value;
    if (first === undefined) break;
    memoryByStoreId.delete(first);
  }
}

export type HubStoreOrderRoomIdsMemoryRead =
  | { hit: false; reason: "miss" | "expired" }
  | { hit: true; roomIds: string[]; ageMs: number };

export function readHubStoreOrderRoomIdsMemory(storeId: string): HubStoreOrderRoomIdsMemoryRead {
  const key = hubStoreOrderRoomIdsMemoryCacheKey(storeId);
  if (!key || key === "store-order-roomids:") return { hit: false, reason: "miss" };
  const now = Date.now();
  pruneExpired(now);
  const row = memoryByStoreId.get(key);
  if (!row) return { hit: false, reason: "miss" };
  if (row.expiresAt <= now) {
    memoryByStoreId.delete(key);
    return { hit: false, reason: "expired" };
  }
  return {
    hit: true,
    roomIds: row.roomIds,
    ageMs: Math.max(0, now - row.cachedAt),
  };
}

export function writeHubStoreOrderRoomIdsMemory(storeId: string, roomIds: string[]): void {
  const key = hubStoreOrderRoomIdsMemoryCacheKey(storeId);
  if (!key || key === "store-order-roomids:") return;
  const now = Date.now();
  const ttl = hubStoreOrderRoomIdsMemoryTtlMs();
  memoryByStoreId.set(key, {
    roomIds: roomIds.map((id) => id.trim()).filter(Boolean),
    cachedAt: now,
    expiresAt: now + ttl,
  });
  pruneExpired(now);
}
