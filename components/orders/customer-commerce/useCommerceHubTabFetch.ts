"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TabCacheEntry<T> = { data: T; fetchedAt: number };

const sessionCache = new Map<string, TabCacheEntry<unknown>>();

export function useCommerceHubTabFetch<T>(opts: {
  cacheKey: string;
  enabled: boolean;
  refresh?: boolean;
  fetcher: (signal: AbortSignal) => Promise<T>;
}): { data: T | null; ready: boolean; authed: boolean; reload: () => void } {
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
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(() => {
    sessionCache.delete(cacheKey);
    setReady(false);
    setData(null);
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
    setReady(false);

    void (async () => {
      try {
        const result = await fetcherRef.current(ac.signal);
        if (!active || ac.signal.aborted) return;
        sessionCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
        setData(result);
        setAuthed(true);
        setReady(true);
      } catch (err) {
        if (!active || ac.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setData(null);
        setReady(true);
      }
    })();

    return () => {
      active = false;
      ac.abort();
    };
  }, [cacheKey, enabled, refresh]);

  return { data, ready, authed, reload };
}

export function markCommerceHubFetchUnauthed(cacheKey: string): void {
  sessionCache.delete(cacheKey);
}
