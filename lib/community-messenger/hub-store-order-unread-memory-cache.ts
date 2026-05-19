/**
 * Hub badge store_order_unread — hub store scoped process memory TTL.
 */

const DEFAULT_TTL_MS = 5_000;

type MemoryEntry = {
  unreadTotal: number;
  cachedAt: number;
  expiresAt: number;
};

const memoryByKey = new Map<string, MemoryEntry>();

export function hubStoreOrderUnreadMemoryTtlMs(): number {
  const raw = process.env.HUB_BADGE_STORE_ORDER_UNREAD_MEMORY_TTL_MS?.trim();
  const n = raw ? Number(raw) : DEFAULT_TTL_MS;
  if (!Number.isFinite(n) || n < 3_000) return DEFAULT_TTL_MS;
  return Math.min(30_000, Math.max(3_000, Math.floor(n)));
}

export function hubStoreOrderUnreadMemoryCacheKey(userId: string, hubStoreId: string): string {
  return `${userId.trim()}|${hubStoreId.trim()}`;
}

export function invalidateHubStoreOrderUnreadMemory(userId: string, hubStoreId?: string): void {
  const uid = userId.trim();
  if (!uid) return;
  const sid = hubStoreId?.trim();
  if (sid) {
    memoryByKey.delete(hubStoreOrderUnreadMemoryCacheKey(uid, sid));
    return;
  }
  const prefix = `${uid}|`;
  for (const key of memoryByKey.keys()) {
    if (key.startsWith(prefix)) memoryByKey.delete(key);
  }
}

function pruneExpired(now: number) {
  for (const [key, row] of memoryByKey) {
    if (row.expiresAt <= now) memoryByKey.delete(key);
  }
  while (memoryByKey.size > 500) {
    const first = memoryByKey.keys().next().value;
    if (first === undefined) break;
    memoryByKey.delete(first);
  }
}

export type HubStoreOrderUnreadMemoryRead =
  | { hit: false; reason: "miss" | "expired" }
  | { hit: true; unreadTotal: number; ageMs: number };

export function readHubStoreOrderUnreadMemory(
  userId: string,
  hubStoreId: string
): HubStoreOrderUnreadMemoryRead {
  const key = hubStoreOrderUnreadMemoryCacheKey(userId, hubStoreId);
  if (!key || key === "|") return { hit: false, reason: "miss" };
  const now = Date.now();
  pruneExpired(now);
  const row = memoryByKey.get(key);
  if (!row) return { hit: false, reason: "miss" };
  if (row.expiresAt <= now) {
    memoryByKey.delete(key);
    return { hit: false, reason: "expired" };
  }
  return {
    hit: true,
    unreadTotal: row.unreadTotal,
    ageMs: Math.max(0, now - row.cachedAt),
  };
}

export function writeHubStoreOrderUnreadMemory(
  userId: string,
  hubStoreId: string,
  unreadTotal: number
): void {
  const key = hubStoreOrderUnreadMemoryCacheKey(userId, hubStoreId);
  if (!key || key === "|") return;
  const now = Date.now();
  const ttl = hubStoreOrderUnreadMemoryTtlMs();
  memoryByKey.set(key, {
    unreadTotal: Math.max(0, Math.floor(unreadTotal) || 0),
    cachedAt: now,
    expiresAt: now + ttl,
  });
  pruneExpired(now);
}
