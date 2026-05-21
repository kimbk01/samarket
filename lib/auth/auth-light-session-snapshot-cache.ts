/**
 * validateActiveSessionLight — profiles.active_session_id + registry OK 스냅샷 (GET 0-query warm).
 */

const TTL_MS = 10_000;

type Snapshot = {
  sessionId: string;
  activeSessionId: string;
  expiresAt: number;
};

type AuthLightSnapshotCacheGlobal = {
  __samarketAuthLightSessionSnapshotCache?: Map<string, Snapshot>;
};

function map(): Map<string, Snapshot> {
  const g = globalThis as AuthLightSnapshotCacheGlobal;
  if (!g.__samarketAuthLightSessionSnapshotCache) {
    g.__samarketAuthLightSessionSnapshotCache = new Map();
  }
  return g.__samarketAuthLightSessionSnapshotCache;
}

function key(userId: string, sessionId: string): string {
  return `${userId.trim()}\0${sessionId.trim()}`;
}

export function peekAuthLightSessionSnapshot(
  userId: string,
  sessionId: string
): { hit: true; activeSessionId: string; ttlRemainingMs: number } | { hit: false } {
  const sid = sessionId.trim();
  const k = key(userId, sid);
  if (!sid || !k || k === "\0") return { hit: false };
  const row = map().get(k);
  if (!row || row.expiresAt <= Date.now() || row.sessionId !== sid) {
    if (row) map().delete(k);
    return { hit: false };
  }
  return { hit: true, activeSessionId: row.activeSessionId, ttlRemainingMs: row.expiresAt - Date.now() };
}

export function setAuthLightSessionSnapshot(
  userId: string,
  sessionId: string,
  activeSessionId: string
): void {
  const sid = sessionId.trim();
  const k = key(userId, sid);
  if (!sid || !k) return;
  map().set(k, {
    sessionId: sid,
    activeSessionId: activeSessionId.trim(),
    expiresAt: Date.now() + TTL_MS,
  });
  if (map().size > 2000) {
    const now = Date.now();
    for (const [kk, v] of map()) {
      if (v.expiresAt <= now) map().delete(kk);
    }
  }
}

export function invalidateAuthLightSessionSnapshotCache(userId?: string): void {
  if (!userId?.trim()) {
    map().clear();
    return;
  }
  const prefix = `${userId.trim()}\0`;
  for (const k of map().keys()) {
    if (k.startsWith(prefix)) map().delete(k);
  }
}
