"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TabCacheEntry<T> = { data: T; fetchedAt: number };

const sessionCache = new Map<string, TabCacheEntry<unknown>>();

export function useCommerceHubTabFetch<T>(opts: {
  cacheKey: string;
  enabled: boolean;
  refresh?: boolean;
  fetcher: (signal: AbortSignal) => Promise<T>;
}): { data: T | null; ready: boolean; authed: boolean; error: boolean; reload: () => void } {
  const { cacheKey, enabled, refresh, fetcher } = opts;
  const [data, setData] = useState<T | null>(() => {
    if (refresh) return null;
    const hit = sessionCache.get(cacheKey);
    return hit ? (hit.data as T) : null;
  });
  const [ready, setReady] = useState(() => {
    if (refresh) return false;
    return sessionCache.has(cacheKey);
  });
  const [authed, setAuthed] = useState(true);
  /** 조회 실패 — 빈 목록과 구분해 오류·다시 시도로 표시. 실패 결과는 캐시하지 않는다 */
  const [error, setError] = useState(false);
  /** reload() 마다 증가 — 같은 cacheKey 로 다시 조회하게 한다 */
  const [reloadNonce, setReloadNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  /** 기존 목록은 유지한 채 다시 조회(전체 로딩으로 비우지 않음) */
  const reload = useCallback(() => {
    sessionCache.delete(cacheKey);
    setReloadNonce((n) => n + 1);
  }, [cacheKey]);

  useEffect(() => {
    if (!enabled) return;
    const cached = !refresh ? sessionCache.get(cacheKey) : null;
    if (cached) {
      setData(cached.data as T);
      setReady(true);
      return;
    }

    const ac = new AbortController();
    let active = true;

    void (async () => {
      try {
        const result = await fetcherRef.current(ac.signal);
        if (!active || ac.signal.aborted) return;
        sessionCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
        setData(result);
        setAuthed(true);
        setError(false);
        setReady(true);
      } catch (err) {
        if (!active || ac.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(true);
        setReady(true);
      }
    })();

    return () => {
      active = false;
      ac.abort();
    };
  }, [cacheKey, enabled, refresh, reloadNonce]);

  return { data, ready, authed, error, reload };
}

export function markCommerceHubFetchUnauthed(cacheKey: string): void {
  sessionCache.delete(cacheKey);
}
