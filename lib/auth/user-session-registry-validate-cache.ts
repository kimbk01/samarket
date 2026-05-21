/**
 * GET hot path — `validateUserSessionRegistry` 결과 TTL (동일 user+session 재조회 제거).
 * 권한 정책 불변: TTL 내 registry 비활성화는 최대 TTL 지연으로만 반영(기존 5s validate 캐시와 동급).
 */

const TTL_MS = 10_000;

type Row = { ok: boolean; expiresAt: number };

type RegistryValidateCacheGlobal = {
  __samarketUserSessionRegistryValidateCache?: Map<string, Row>;
};

function map(): Map<string, Row> {
  const g = globalThis as RegistryValidateCacheGlobal;
  if (!g.__samarketUserSessionRegistryValidateCache) {
    g.__samarketUserSessionRegistryValidateCache = new Map();
  }
  return g.__samarketUserSessionRegistryValidateCache;
}

function key(userId: string, sessionId: string): string {
  return `${userId.trim()}\0${sessionId.trim()}`;
}

export function peekUserSessionRegistryValidated(
  userId: string,
  sessionId: string
): { hit: true; ok: boolean; ttlRemainingMs: number } | { hit: false } {
  const k = key(userId, sessionId);
  if (!k || k === "\0") return { hit: false };
  const row = map().get(k);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) map().delete(k);
    return { hit: false };
  }
  return { hit: true, ok: row.ok, ttlRemainingMs: row.expiresAt - Date.now() };
}

export function setUserSessionRegistryValidated(
  userId: string,
  sessionId: string,
  ok: boolean
): void {
  const k = key(userId, sessionId);
  if (!k || k === "\0") return;
  map().set(k, { ok, expiresAt: Date.now() + TTL_MS });
  if (map().size > 2000) {
    const now = Date.now();
    for (const [kk, v] of map()) {
      if (v.expiresAt <= now) map().delete(kk);
    }
  }
}

export function invalidateUserSessionRegistryValidateCache(userId?: string): void {
  if (!userId?.trim()) {
    map().clear();
    return;
  }
  const prefix = `${userId.trim()}\0`;
  for (const k of map().keys()) {
    if (k.startsWith(prefix)) map().delete(k);
  }
}

export const USER_SESSION_REGISTRY_VALIDATE_CACHE_TTL_MS = TTL_MS;
