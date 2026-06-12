"use client";

type QueryEntry<T = unknown> = {
  data: T;
  fetchedAt: number;
  expiresAt: number;
};

const store = new Map<string, QueryEntry>();

export function peekAdminQueryData<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  return hit.data as T;
}

export function peekAdminQueryEntry<T>(key: string): QueryEntry<T> | undefined {
  return store.get(key) as QueryEntry<T> | undefined;
}

export function isAdminQueryFresh(key: string, now = Date.now()): boolean {
  const hit = store.get(key);
  return !!hit && hit.expiresAt > now;
}

export function setAdminQueryData<T>(key: string, data: T, ttlMs: number, now = Date.now()): void {
  store.set(key, {
    data,
    fetchedAt: now,
    expiresAt: now + Math.max(0, ttlMs),
  });
}

export function invalidateAdminQueryCache(keyOrPrefix: string): void {
  const needle = keyOrPrefix.trim();
  if (!needle) return;
  for (const k of [...store.keys()]) {
    if (k === needle || k.startsWith(needle)) store.delete(k);
  }
}

/** dev 진단 */
export function getAdminQueryCacheSize(): number {
  return store.size;
}
