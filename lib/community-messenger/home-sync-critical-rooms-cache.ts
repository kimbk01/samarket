/** home-sync critical `fetchMyRoomsPayload` 스냅샷 — service 내부 `MessengerRoomsPayload` 와 동형 */
export type HomeSyncCriticalRoomsPayload = {
  roomRows: unknown[];
  participantRows: unknown[];
  byRoomId: Map<string, unknown[]>;
  roomProfileMap: Map<string, unknown>;
};

const HOME_SYNC_CRITICAL_ROOMS_CACHE_TTL_MS = 2_000;
const HOME_SYNC_CRITICAL_ROOMS_CACHE_MAX = 2_000;

type Entry = { expiresAt: number; payload: HomeSyncCriticalRoomsPayload };

const cache = new Map<string, Entry>();

function cacheKey(userId: string, cap: number): string {
  return `${userId.trim()}:critical:${Math.max(1, Math.floor(cap))}`;
}

export function peekHomeSyncCriticalRoomsCache(
  userId: string,
  cap: number
): HomeSyncCriticalRoomsPayload | undefined {
  const k = cacheKey(userId, cap);
  const row = cache.get(k);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) cache.delete(k);
    return undefined;
  }
  return row.payload;
}

export function setHomeSyncCriticalRoomsCache(
  userId: string,
  cap: number,
  payload: HomeSyncCriticalRoomsPayload
): void {
  const now = Date.now();
  cache.set(cacheKey(userId, cap), {
    expiresAt: now + HOME_SYNC_CRITICAL_ROOMS_CACHE_TTL_MS,
    payload,
  });
  if (cache.size > HOME_SYNC_CRITICAL_ROOMS_CACHE_MAX) {
    for (const [key, v] of cache) {
      if (v.expiresAt < now || cache.size > HOME_SYNC_CRITICAL_ROOMS_CACHE_MAX * 0.85) cache.delete(key);
      if (cache.size <= HOME_SYNC_CRITICAL_ROOMS_CACHE_MAX * 0.85) break;
    }
  }
}
