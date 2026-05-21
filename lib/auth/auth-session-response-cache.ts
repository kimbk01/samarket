/** GET /api/auth/session — 검증 통과 스냅 TTL (쿠키 갱신 경로는 매 요청 유지, globalThis). */
const TTL_MS = 3_000;

type CacheEntry = { expiresAt: number };

type AuthSessionResponseCacheGlobal = {
  __samarketAuthSessionResponseCache?: Map<string, CacheEntry>;
};

function cacheMap(): Map<string, CacheEntry> {
  const g = globalThis as AuthSessionResponseCacheGlobal;
  if (!g.__samarketAuthSessionResponseCache) {
    g.__samarketAuthSessionResponseCache = new Map();
  }
  return g.__samarketAuthSessionResponseCache;
}

function cacheKey(userId: string, sessionFingerprint: string): string {
  return `${userId.trim()}\0${sessionFingerprint}`;
}

export function peekAuthSessionValidatedOk(userId: string, sessionFingerprint: string): boolean {
  return peekAuthSessionValidatedOkMeta(userId, sessionFingerprint).hit;
}

export function peekAuthSessionValidatedOkMeta(
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

export function setAuthSessionValidatedOk(userId: string, sessionFingerprint: string): void {
  cacheMap().set(cacheKey(userId, sessionFingerprint), { expiresAt: Date.now() + TTL_MS });
  if (cacheMap().size > 500) {
    const now = Date.now();
    for (const [kk, v] of cacheMap()) {
      if (v.expiresAt <= now) cacheMap().delete(kk);
    }
  }
}
