/**
 * GET /api/community-messenger/rooms/[roomId]/bootstrap 짧은 TTL 메모리 캐시.
 * 메시지 등 방 내용이 바뀌면 동일 방에 대한 항목을 제거해 다른 참가자·새로고침이 옛 스냅샷을 보지 않게 한다.
 */

const ROOM_BOOTSTRAP_CACHE_TTL_MS = 2500;
const ROOM_BOOTSTRAP_CACHE_MAX = 240;
const roomBootstrapCache = new Map<string, { at: number; snapshot: unknown }>();

function pruneRoomBootstrapCache(now = Date.now()): void {
  for (const [k, v] of roomBootstrapCache) {
    if (now - v.at > ROOM_BOOTSTRAP_CACHE_TTL_MS) roomBootstrapCache.delete(k);
  }
  if (roomBootstrapCache.size <= ROOM_BOOTSTRAP_CACHE_MAX) return;
  const overflow = roomBootstrapCache.size - ROOM_BOOTSTRAP_CACHE_MAX;
  let i = 0;
  for (const k of roomBootstrapCache.keys()) {
    roomBootstrapCache.delete(k);
    i += 1;
    if (i >= overflow) break;
  }
}

export function getCachedRoomBootstrap(key: string): unknown | null {
  pruneRoomBootstrapCache();
  const row = roomBootstrapCache.get(key);
  if (!row) return null;
  if (Date.now() - row.at > ROOM_BOOTSTRAP_CACHE_TTL_MS) {
    roomBootstrapCache.delete(key);
    return null;
  }
  return row.snapshot;
}

export function setCachedRoomBootstrap(key: string, snapshot: unknown): void {
  roomBootstrapCache.set(key, { at: Date.now(), snapshot });
  pruneRoomBootstrapCache();
}

/** `cm_room_bootstrap:<userId>:<roomId>:...` 키에서 해당 방 스냅샷만 전부 제거 */
export function invalidateRoomBootstrapRouteCacheForRoom(roomId: string): void {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  const needle = `:${id}:`;
  for (const k of Array.from(roomBootstrapCache.keys())) {
    if (k.includes(needle)) roomBootstrapCache.delete(k);
  }
}
