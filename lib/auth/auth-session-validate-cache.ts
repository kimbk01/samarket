/** `validateActiveSessionLight` 통과 스냅 — 동일 userId·세션 지문 연속 GET 합류 */
const TTL_MS = 5_000;

const okCache = new Map<string, { expiresAt: number }>();

function cacheKey(userId: string, sessionFingerprint: string): string {
  return `${userId.trim()}\0${sessionFingerprint}`;
}

export function peekAuthSessionValidateCached(userId: string, sessionFingerprint: string): boolean {
  const k = cacheKey(userId, sessionFingerprint);
  const row = okCache.get(k);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) okCache.delete(k);
    return false;
  }
  return true;
}

export function setAuthSessionValidateCached(userId: string, sessionFingerprint: string): void {
  okCache.set(cacheKey(userId, sessionFingerprint), { expiresAt: Date.now() + TTL_MS });
  if (okCache.size > 800) {
    const now = Date.now();
    for (const [kk, v] of okCache) {
      if (v.expiresAt <= now) okCache.delete(kk);
    }
  }
}

export const AUTH_SESSION_VALIDATE_CACHE_TTL_MS = TTL_MS;
