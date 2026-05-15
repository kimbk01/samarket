/** GET /api/auth/session — 검증 통과 스냅 TTL (쿠키 갱신 경로는 매 요청 유지). */
const TTL_MS = 3_000;

const okCache = new Map<string, { expiresAt: number }>();

function cacheKey(userId: string, sessionFingerprint: string): string {
  return `${userId.trim()}\0${sessionFingerprint}`;
}

export function peekAuthSessionValidatedOk(userId: string, sessionFingerprint: string): boolean {
  const k = cacheKey(userId, sessionFingerprint);
  const row = okCache.get(k);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) okCache.delete(k);
    return false;
  }
  return true;
}

export function setAuthSessionValidatedOk(userId: string, sessionFingerprint: string): void {
  okCache.set(cacheKey(userId, sessionFingerprint), { expiresAt: Date.now() + TTL_MS });
  if (okCache.size > 500) {
    const now = Date.now();
    for (const [kk, v] of okCache) {
      if (v.expiresAt <= now) okCache.delete(kk);
    }
  }
}
