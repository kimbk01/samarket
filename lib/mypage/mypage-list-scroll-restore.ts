"use client";

/**
 * 내정보 하위 목록 스크롤·탭·필터 복원 (Part A §1.4 — 신규).
 *
 * - 키 = `pathname + "?" + 정렬된 search` (탭·필터 포함 — `?tab=` 마다 따로 저장).
 * - 저장소 = sessionStorage `dibay:mypage-list:<key>` `{ y, loadedPages, savedAt }`, 30분.
 * - 복원은 popstate(뒤로/앞으로)로 그 키에 돌아왔을 때만. 새로 진입(push)하면 복원하지 않는다.
 * - 전역 `history.scrollRestoration = "manual"` 은 유지(X3) — 여기서 바꾸지 않는다.
 * - 이미 불러온 페이지는 모듈 메모리 캐시(키별 최근 10개, 5분)에 둘 수 있다 — 화면 연결은 R4/R5.
 */

import { MYPAGE_SCROLL_RESTORE_TTL_MS } from "@/lib/mypage/mypage-hub-scroll-restore";

const KEY_PREFIX = "dibay:mypage-list:";
const KEY_POPSTATE_PENDING = "dibay:mypage-list-popstate-pending";

export const MYPAGE_LIST_SCROLL_TTL_MS = MYPAGE_SCROLL_RESTORE_TTL_MS;
export const MYPAGE_LIST_PAGE_CACHE_MAX_ENTRIES = 10;
export const MYPAGE_LIST_PAGE_CACHE_TTL_MS = 5 * 60_000;

export type MypageListScrollSnapshot = {
  y: number;
  loadedPages: number;
  savedAt: number;
};

function normalizePathname(pathname: string): string {
  const p = (pathname || "").split("?")[0]?.trim() ?? "";
  return p.length > 1 ? p.replace(/\/+$/, "") : p || "/";
}

/** `pathname + "?" + 정렬된 search` — 같은 탭·필터 조합은 순서와 무관하게 같은 키. */
export function buildMypageListRestoreKey(pathname: string, search?: string | URLSearchParams | null): string {
  const path = normalizePathname(pathname);
  const params =
    search instanceof URLSearchParams
      ? new URLSearchParams(search)
      : new URLSearchParams(String(search ?? "").replace(/^\?/, ""));
  const entries = [...params.entries()].sort(([a, av], [b, bv]) =>
    a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1
  );
  const sorted = new URLSearchParams(entries).toString();
  return `${path}?${sorted}`;
}

export function currentMypageListRestoreKey(): string | null {
  if (typeof window === "undefined") return null;
  return buildMypageListRestoreKey(window.location.pathname, window.location.search);
}

export function saveMypageListScroll(
  key: string,
  snapshot: { y: number; loadedPages?: number },
  now: number = Date.now()
): void {
  if (typeof sessionStorage === "undefined") return;
  const value: MypageListScrollSnapshot = {
    y: Math.max(0, Math.round(Number(snapshot.y) || 0)),
    loadedPages: Math.max(1, Math.round(Number(snapshot.loadedPages) || 1)),
    savedAt: now,
  };
  try {
    sessionStorage.setItem(KEY_PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

export function readMypageListScroll(key: string, now: number = Date.now()): MypageListScrollSnapshot | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MypageListScrollSnapshot>;
    const savedAt = Number(parsed?.savedAt) || 0;
    if (!savedAt || savedAt + MYPAGE_LIST_SCROLL_TTL_MS < now) {
      sessionStorage.removeItem(KEY_PREFIX + key);
      return null;
    }
    return {
      y: Math.max(0, Math.round(Number(parsed.y) || 0)),
      loadedPages: Math.max(1, Math.round(Number(parsed.loadedPages) || 1)),
      savedAt,
    };
  } catch {
    return null;
  }
}

export function clearMypageListScroll(key: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(KEY_PREFIX + key);
  } catch {
    /* ignore */
  }
}

/** popstate 시점 location = 이동 목적지 — 그 키만 복원 대기로 표시한다. */
export function noteMypageListPopstatePending(key: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(KEY_POPSTATE_PENDING, key);
  } catch {
    /* quota */
  }
}

/** 대기 키가 `key` 와 같을 때만 true (한 번만 소비). 다른 키면 대기를 지운다. */
export function consumeMypageListPopstatePending(key: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const pending = sessionStorage.getItem(KEY_POPSTATE_PENDING);
    if (pending == null) return false;
    sessionStorage.removeItem(KEY_POPSTATE_PENDING);
    return pending === key;
  } catch {
    return false;
  }
}

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
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(KEY_POPSTATE_PENDING);
  } catch {
    /* ignore */
  }
}
