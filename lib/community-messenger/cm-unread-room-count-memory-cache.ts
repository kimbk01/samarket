/**
 * Hub badge cm_unread — `get_community_messenger_unread_room_count` process memory TTL.
 */

const DEFAULT_TTL_MS = 5_000;

type MemoryEntry = {
  unreadRoomCount: number;
  cachedAt: number;
  expiresAt: number;
};

const memoryByUser = new Map<string, MemoryEntry>();

export function communityMessengerUnreadMemoryTtlMs(): number {
  const raw = process.env.HUB_BADGE_CM_UNREAD_MEMORY_TTL_MS?.trim();
  const n = raw ? Number(raw) : DEFAULT_TTL_MS;
  if (!Number.isFinite(n) || n < 3_000) return DEFAULT_TTL_MS;
  return Math.min(30_000, Math.max(3_000, Math.floor(n)));
}

export function invalidateCommunityMessengerUnreadTotalCache(userId: string): void {
  const k = userId.trim();
  if (!k) return;
  memoryByUser.delete(k);
}

function pruneExpired(now: number) {
  for (const [key, row] of memoryByUser) {
    if (row.expiresAt <= now) memoryByUser.delete(key);
  }
  while (memoryByUser.size > 500) {
    const first = memoryByUser.keys().next().value;
    if (first === undefined) break;
    memoryByUser.delete(first);
  }
}

export type CmUnreadRoomCountMemoryRead =
  | { hit: false; reason: "miss" | "expired" }
  | { hit: true; unreadRoomCount: number; ageMs: number };

export function readCmUnreadRoomCountMemory(userId: string): CmUnreadRoomCountMemoryRead {
  const k = userId.trim();
  if (!k) return { hit: false, reason: "miss" };
  const now = Date.now();
  pruneExpired(now);
  const row = memoryByUser.get(k);
  if (!row) return { hit: false, reason: "miss" };
  if (row.expiresAt <= now) {
    memoryByUser.delete(k);
    return { hit: false, reason: "expired" };
  }
  return {
    hit: true,
    unreadRoomCount: row.unreadRoomCount,
    ageMs: Math.max(0, now - row.cachedAt),
  };
}

export function writeCmUnreadRoomCountMemory(userId: string, unreadRoomCount: number): void {
  const k = userId.trim();
  if (!k) return;
  const now = Date.now();
  const ttl = communityMessengerUnreadMemoryTtlMs();
  memoryByUser.set(k, {
    unreadRoomCount: Math.max(0, Math.floor(unreadRoomCount) || 0),
    cachedAt: now,
    expiresAt: now + ttl,
  });
  pruneExpired(now);
}
