type ReadCountCacheEntry = {
  readCount: number;
  fetchedAtMs: number;
};

const TTL_MS = 5_000;
const cache = new Map<string, ReadCountCacheEntry>();

function cacheKey(roomId: string, messageId: string): string {
  return `${roomId}:${messageId}`;
}

export function getCachedGroupMessageReadCount(roomId: string, messageId: string): number | null {
  const key = cacheKey(roomId, messageId);
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAtMs > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.readCount;
}

export function setCachedGroupMessageReadCount(
  roomId: string,
  messageId: string,
  readCount: number
): void {
  cache.set(cacheKey(roomId, messageId), { readCount, fetchedAtMs: Date.now() });
}

export function invalidateGroupReadCountCache(roomId: string): void {
  const prefix = `${roomId}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function batchSetCachedGroupMessageReadCounts(
  roomId: string,
  rows: Array<{ messageId: string; readCount: number }>
): void {
  for (const row of rows) {
    setCachedGroupMessageReadCount(roomId, row.messageId, row.readCount);
  }
}
