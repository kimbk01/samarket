"use client";

/**
 * 내정보 하위 목록 — 이미 불러온 페이지 메모리 캐시 (키별 최근 10개, 5분).
 * 뒤로 돌아왔을 때 목록을 다시 받지 않고 같은 높이로 그려, 스크롤 규칙(`lib/navigation/app-scroll-memory.ts`)이 그 위치로 돌아가게 한다.
 * 스크롤 위치 저장·복원은 이 모듈이 아니라 `lib/navigation/app-scroll-memory.ts` 하나만 한다 (2026-11-03 — 두 장치가 겹쳐 새 진입이 옛 위치로 열리던 결함).
 */

export const MYPAGE_LIST_PAGE_CACHE_MAX_ENTRIES = 10;
export const MYPAGE_LIST_PAGE_CACHE_TTL_MS = 5 * 60_000;

/* ── 이미 불러온 페이지 메모리 캐시 (키별 최근 10개, 5분) ───────────────────── */

type PageCacheEntry = { value: unknown; savedAt: number };
const pageCache = new Map<string, PageCacheEntry>();

export function writeMypageListPageCache<T>(key: string, value: T, now: number = Date.now()): void {
  pageCache.delete(key);
  pageCache.set(key, { value, savedAt: now });
  while (pageCache.size > MYPAGE_LIST_PAGE_CACHE_MAX_ENTRIES) {
    const oldest = pageCache.keys().next().value;
    if (oldest === undefined) break;
    pageCache.delete(oldest);
  }
}

export function peekMypageListPageCache<T>(key: string, now: number = Date.now()): T | null {
  const hit = pageCache.get(key);
  if (!hit) return null;
  if (hit.savedAt + MYPAGE_LIST_PAGE_CACHE_TTL_MS < now) {
    pageCache.delete(key);
    return null;
  }
  return hit.value as T;
}

export function resetMypageListScrollRestoreForTests(): void {
  pageCache.clear();
}
