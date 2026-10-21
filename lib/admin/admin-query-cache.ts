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

/** 계정 전환·로그아웃 — 이전 관리자 계정의 조회 캐시 전부 삭제 (AD-08). */
export function clearAllAdminQueryCache(): void {
  store.clear();
}

/** dev 진단 */
export function getAdminQueryCacheSize(): number {
  return store.size;
}
