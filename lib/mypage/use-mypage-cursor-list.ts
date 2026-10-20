"use client";

/**
 * 내정보 커서 목록 공용 훅 (최종 설계 C.0.2 「더 보기」·「상태 4종」 · Part A §1.4·§1.6·§1.7).
 *
 * - 첫 페이지: `status` loading → ready | error (오류를 빈 목록으로 바꾸지 않는다). 401 은 `unauthorized`.
 * - 더 보기: `loadMore()` — 실패는 `loadMoreError`(같은 자리 [다시 시도]), 목록은 유지.
 * - 재진입 캐시: 모듈 메모리(키별, 최근 10개, 5분)에 **불러온 페이지 전체**를 보관 → 즉시 렌더 후 조용한 재검증
 *   (캐시가 30초 이내면 재검증 생략 — RSC 로 심은 첫 페이지는 추가 요청 없음).
 *   재검증은 첫 페이지만 교체하고, 이미 불러온 추가 페이지는 커서 뒤 항목만 이어 붙인다.
 * - 요청 타임아웃 15초 → 오류(무한 로딩 금지 §1.6).
 * - 낙관 갱신용 `setItems` — 해제·삭제·되돌리기에서 사용(캐시도 함께 갱신).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export const MYPAGE_LIST_CACHE_TTL_MS = 5 * 60_000;
export const MYPAGE_LIST_CACHE_MAX_KEYS = 10;
export const MYPAGE_LIST_REQUEST_TIMEOUT_MS = 15_000;
/** 이 시간 안의 캐시(방금 RSC 로 심은 첫 페이지 포함)는 재검증 생략 — 첫 진입 요청 예산(§1.7) */
export const MYPAGE_LIST_REVALIDATE_AFTER_MS = 30_000;

export type MypageCursorPage<T> = { items: T[]; next_cursor: string | null };

export class MypageListHttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`mypage_list_http_${status}`);
    this.status = status;
  }
}

type CacheEntry<T> = { items: T[]; nextCursor: string | null; pages: number; at: number };

const cache = new Map<string, CacheEntry<unknown>>();

export function readMypageListCache<T>(key: string, now = Date.now()): CacheEntry<T> | null {
  const e = cache.get(key) as CacheEntry<T> | undefined;
  if (!e) return null;
  if (now - e.at > MYPAGE_LIST_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return e;
}

export function writeMypageListCache<T>(key: string, entry: Omit<CacheEntry<T>, "at">, now = Date.now()): void {
  cache.delete(key);
  cache.set(key, { ...entry, at: now });
  while (cache.size > MYPAGE_LIST_CACHE_MAX_KEYS) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** 키 접두로 캐시 삭제(쓰기 후 다른 탭·필터 무효화, 로그아웃) */
export function forgetMypageListCache(prefix = ""): void {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
}

/**
 * JSON GET — 15초 타임아웃, `!ok` 는 `MypageListHttpError`(status) 로 던진다.
 * 화면은 status 401 만 로그인 이동, 나머지는 오류 상태.
 */
export async function fetchMypageListJson<T>(url: string, init?: RequestInit): Promise<T> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), MYPAGE_LIST_REQUEST_TIMEOUT_MS) : null;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      credentials: "include",
      ...init,
      signal: ctrl?.signal ?? init?.signal,
    });
    if (!res.ok) throw new MypageListHttpError(res.status);
    return (await res.json()) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 첫 페이지 재검증 결과를 기존 목록(추가 페이지 포함)과 합친다 */
export function mergeMypageFirstPage<T>(
  prev: { items: T[]; nextCursor: string | null; pages: number },
  first: MypageCursorPage<T>,
  getId: (item: T) => string
): { items: T[]; nextCursor: string | null; pages: number } {
  if (prev.pages <= 1 || first.next_cursor == null) {
    return { items: first.items, nextCursor: first.next_cursor, pages: 1 };
  }
  const firstIds = new Set(first.items.map(getId));
  const lastFirst = first.items[first.items.length - 1];
  const lastIdx = lastFirst ? prev.items.findIndex((x) => getId(x) === getId(lastFirst)) : -1;
  const tail = (lastIdx >= 0 ? prev.items.slice(lastIdx + 1) : prev.items.slice(first.items.length)).filter(
    (x) => !firstIds.has(getId(x))
  );
  return { items: [...first.items, ...tail], nextCursor: prev.nextCursor, pages: prev.pages };
}

export type UseMypageCursorListOptions<T> = {
  /** 캐시·단일 비행 키 — null 이면 대기(비로그인 등) */
  cacheKey: string | null;
  fetchPage: (cursor: string | null) => Promise<MypageCursorPage<T>>;
  getId: (item: T) => string;
};

export type MypageCursorListState<T> = {
  status: "loading" | "ready" | "error";
  unauthorized: boolean;
  items: T[];
  nextCursor: string | null;
  pages: number;
  loadingMore: boolean;
  loadMoreError: boolean;
  /** 첫 페이지 다시(스켈레톤 없이 기존 목록 유지 — 오류 상태였다면 loading 으로) */
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
  /** 낙관 갱신 — 캐시에도 반영 */
  setItems: (updater: (prev: T[]) => T[]) => void;
};

export function useMypageCursorList<T>({
  cacheKey,
  fetchPage,
  getId,
}: UseMypageCursorListOptions<T>): MypageCursorListState<T> {
  const cached = cacheKey ? readMypageListCache<T>(cacheKey) : null;
  const [items, setItemsState] = useState<T[]>(() => cached?.items ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(() => cached?.nextCursor ?? null);
  const [pages, setPages] = useState<number>(() => cached?.pages ?? 0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(() => (cached ? "ready" : "loading"));
  const [unauthorized, setUnauthorized] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);

  const fetchRef = useRef(fetchPage);
  const getIdRef = useRef(getId);
  useEffect(() => {
    fetchRef.current = fetchPage;
    getIdRef.current = getId;
  });

  const stateRef = useRef({ items, nextCursor, pages });
  const keyRef = useRef(cacheKey);
  useEffect(() => {
    keyRef.current = cacheKey;
  }, [cacheKey]);

  const commit = useCallback((key: string, next: { items: T[]; nextCursor: string | null; pages: number }) => {
    if (keyRef.current !== key) return;
    stateRef.current = next;
    setItemsState(next.items);
    setNextCursor(next.nextCursor);
    setPages(next.pages);
    writeMypageListCache<T>(key, next);
  }, []);

  const loadFirst = useCallback(
    async (key: string, quiet: boolean) => {
      if (!quiet) setStatus("loading");
      try {
        const page = await runSingleFlight(`${key}:first`, () => fetchRef.current(null));
        if (keyRef.current !== key) return;
        const prev = stateRef.current;
        const merged = quiet ? mergeMypageFirstPage(prev, page, getIdRef.current) : {
          items: page.items,
          nextCursor: page.next_cursor,
          pages: 1,
        };
        commit(key, merged);
        setUnauthorized(false);
        setLoadMoreError(false);
        setStatus("ready");
      } catch (e) {
        if (keyRef.current !== key) return;
        if (e instanceof MypageListHttpError && e.status === 401) setUnauthorized(true);
        // 조용한 재검증 실패는 기존 목록 유지(부분 오류 — 배너 없음)
        if (!quiet) setStatus("error");
      }
    },
    [commit]
  );

  useEffect(() => {
    if (!cacheKey) return;
    const hit = readMypageListCache<T>(cacheKey);
    stateRef.current = hit
      ? { items: hit.items, nextCursor: hit.nextCursor, pages: hit.pages }
      : { items: [], nextCursor: null, pages: 0 };
    if (hit) {
      setItemsState(hit.items);
      setNextCursor(hit.nextCursor);
      setPages(hit.pages);
      setStatus("ready");
      if (Date.now() - hit.at >= MYPAGE_LIST_REVALIDATE_AFTER_MS) void loadFirst(cacheKey, true);
    } else {
      setItemsState([]);
      setNextCursor(null);
      setPages(0);
      void loadFirst(cacheKey, false);
    }
    setLoadMoreError(false);
  }, [cacheKey, loadFirst]);

  const reload = useCallback(async () => {
    const key = keyRef.current;
    if (!key) return;
    const wasError = status === "error" || stateRef.current.pages === 0;
    await loadFirst(key, !wasError);
  }, [loadFirst, status]);

  const loadMore = useCallback(async () => {
    const key = keyRef.current;
    const cursor = stateRef.current.nextCursor;
    if (!key || !cursor) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const page = await runSingleFlight(`${key}:more:${cursor}`, () => fetchRef.current(cursor));
      if (keyRef.current !== key) return;
      const prev = stateRef.current;
      const seen = new Set(prev.items.map(getIdRef.current));
      commit(key, {
        items: [...prev.items, ...page.items.filter((x) => !seen.has(getIdRef.current(x)))],
        nextCursor: page.next_cursor,
        pages: prev.pages + 1,
      });
    } catch (e) {
      if (keyRef.current !== key) return;
      if (e instanceof MypageListHttpError && e.status === 401) setUnauthorized(true);
      setLoadMoreError(true);
    } finally {
      if (keyRef.current === key) setLoadingMore(false);
    }
  }, [commit]);

  const setItems = useCallback(
    (updater: (prev: T[]) => T[]) => {
      const key = keyRef.current;
      const prev = stateRef.current;
      const nextItems = updater(prev.items);
      stateRef.current = { ...prev, items: nextItems };
      setItemsState(nextItems);
      if (key) writeMypageListCache<T>(key, { items: nextItems, nextCursor: prev.nextCursor, pages: prev.pages });
    },
    []
  );

  return { status, unauthorized, items, nextCursor, pages, loadingMore, loadMoreError, reload, loadMore, setItems };
}
