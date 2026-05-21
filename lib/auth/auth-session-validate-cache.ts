/** `validateActiveSessionLight` 통과 스냅 — 동일 userId·세션 지문 연속 GET 합류 (globalThis) */
const TTL_MS = 5_000;

type CacheEntry = { expiresAt: number };

type AuthSessionValidateCacheGlobal = {
  __samarketAuthSessionValidateCache?: Map<string, CacheEntry>;
};

function cacheMap(): Map<string, CacheEntry> {
  const g = globalThis as AuthSessionValidateCacheGlobal;
  if (!g.__samarketAuthSessionValidateCache) {
    g.__samarketAuthSessionValidateCache = new Map();
  }
  return g.__samarketAuthSessionValidateCache;
}

function cacheKey(userId: string, sessionFingerprint: string): string {
  return `${userId.trim()}\0${sessionFingerprint}`;
}

export function peekAuthSessionValidateCached(userId: string, sessionFingerprint: string): boolean {
  return peekAuthSessionValidateCachedMeta(userId, sessionFingerprint).hit;
}

export function peekAuthSessionValidateCachedMeta(
  userId: string,
  sessionFingerprint: string
): { hit: boolean; ttlRemainingMs: number } {
  const k = cacheKey(userId, sessionFingerprint);
  const row = cacheMap().get(k);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) cacheMap().delete(k);
    return { hit: false, ttlRemainingMs: 0 };
  }
  return { hit: true, ttlRemainingMs: Math.max(0, row.expiresAt - Date.now()) };
}

export function setAuthSessionValidateCached(userId: string, sessionFingerprint: string): void {
  cacheMap().set(cacheKey(userId, sessionFingerprint), { expiresAt: Date.now() + TTL_MS });
  if (cacheMap().size > 800) {
    const now = Date.now();
    for (const [kk, v] of cacheMap()) {
      if (v.expiresAt <= now) cacheMap().delete(kk);
    }
  }
}

export const AUTH_SESSION_VALIDATE_CACHE_TTL_MS = TTL_MS;
