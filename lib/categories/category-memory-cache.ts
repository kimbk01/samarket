/**
 * 브라우저 세션 동안 카테고리 조회 반복을 줄이기 위한 짧은 TTL 메모리 캐시.
 * (거래 탭 전환·마켓 재진입 시 Supabase 왕복 감소)
 */
const DEFAULT_TTL_MS = 45_000;

type Entry<T> = { at: number; value: T };

const store = new Map<string, Entry<unknown>>();

export function readCategoryCache<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at >= ttlMs) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export function writeCategoryCache<T>(key: string, value: T): void {
  store.set(key, { at: Date.now(), value });
}

export function invalidateCategoryCachePrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

export async function cachedCategoryFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const hit = readCategoryCache<T>(key, ttlMs);
  if (hit != null) return hit;
  const value = await fetcher();
  writeCategoryCache(key, value);
  return value;
}
