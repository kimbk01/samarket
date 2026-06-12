"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  invalidateAdminQueryCache,
  isAdminQueryFresh,
  peekAdminQueryData,
  setAdminQueryData,
} from "@/lib/admin/admin-query-cache";
import { ADMIN_QUERY_TTL_MS } from "@/lib/admin/admin-query-ttl";
import { logAdminApiCall } from "@/lib/admin/admin-perf-logger";

export type UseAdminQueryOptions<T> = {
  queryKey: string;
  fetcher: () => Promise<T>;
  ttlMs?: number;
  enabled?: boolean;
  /** 탭이 보일 때만 주기 갱신 */
  pollIntervalMs?: number;
  /** fresh 캐시가 있어도 마운트 시 백그라운드 재검증 */
  revalidateOnMount?: boolean;
};

export type UseAdminQueryResult<T> = {
  data: T | null;
  error: string | null;
  /** 캐시 없이 최초 로딩 */
  loading: boolean;
  /** 캐시 표시 중 백그라운드 갱신 */
  refreshing: boolean;
  revalidate: (options?: { force?: boolean }) => Promise<void>;
  mutate: (updater: T | ((prev: T | null) => T | null)) => void;
  invalidate: () => void;
};

export function useAdminQuery<T>({
  queryKey,
  fetcher,
  ttlMs = ADMIN_QUERY_TTL_MS,
  enabled = true,
  pollIntervalMs,
  revalidateOnMount = false,
}: UseAdminQueryOptions<T>): UseAdminQueryResult<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const queryKeyRef = useRef(queryKey);
  queryKeyRef.current = queryKey;

  const requestGenRef = useRef(0);

  const [data, setData] = useState<T | null>(() =>
    enabled ? (peekAdminQueryData<T>(queryKey) ?? null) : null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => enabled && !peekAdminQueryData<T>(queryKey));
  const [refreshing, setRefreshing] = useState(false);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const syncFromCache = useCallback((key: string, isEnabled: boolean) => {
    if (!isEnabled) {
      setLoading(false);
      return null;
    }
    const cached = peekAdminQueryData<T>(key);
    setData(cached ?? null);
    setLoading(!cached);
    return cached;
  }, []);

  const runFetch = useCallback(
    async (options?: { background?: boolean; force?: boolean }) => {
      const key = queryKeyRef.current;
      if (!enabled) return;

      const background = options?.background === true;
      const hadCache = !!peekAdminQueryData<T>(key);

      if (inFlightRef.current) {
        logAdminApiCall(`admin-query:${key}`, { duplicate: true });
        if (options?.force) {
          await inFlightRef.current;
        } else {
          return inFlightRef.current;
        }
      }

      const generation = requestGenRef.current;

      const task = (async () => {
        if (!background && !hadCache) setLoading(true);
        if (background || hadCache) setRefreshing(true);
        if (!background) setError(null);

        logAdminApiCall(`admin-query:${key}`);
        try {
          const next = await fetcherRef.current();
          if (generation !== requestGenRef.current) return;
          setAdminQueryData(key, next, ttlMs);
          setData(next);
          setError(null);
        } catch (err) {
          if (generation !== requestGenRef.current) return;
          const message = err instanceof Error ? err.message : "fetch_failed";
          const stillCached = !!peekAdminQueryData<T>(key);
          if (!background || !stillCached) {
            setError(message);
            if (!stillCached) setData(null);
          }
        } finally {
          if (generation !== requestGenRef.current) return;
          setLoading(false);
          setRefreshing(false);
          inFlightRef.current = null;
        }
      })();

      inFlightRef.current = task;
      return task;
    },
    [enabled, ttlMs]
  );

  const revalidate = useCallback(
    async (options?: { force?: boolean }) => {
      const key = queryKeyRef.current;
      if (!enabled) return;
      const fresh = isAdminQueryFresh(key);
      if (!options?.force && fresh) return;
      await runFetch({
        background: fresh || !!peekAdminQueryData<T>(key),
        force: options?.force,
      });
    },
    [enabled, runFetch]
  );

  const mutate = useCallback(
    (updater: T | ((prev: T | null) => T | null)) => {
      const key = queryKeyRef.current;
      setData((prev) => {
        const next =
          typeof updater === "function" ? (updater as (p: T | null) => T | null)(prev) : updater;
        setAdminQueryData(key, next, ttlMs);
        return next;
      });
      setError(null);
    },
    [ttlMs]
  );

  const invalidate = useCallback(() => {
    const key = queryKeyRef.current;
    invalidateAdminQueryCache(key);
    setData(null);
    setError(null);
    setLoading(false);
    setRefreshing(false);
    requestGenRef.current += 1;
    inFlightRef.current = null;
  }, []);

  useEffect(() => {
    requestGenRef.current += 1;
    inFlightRef.current = null;
    setError(null);

    if (!enabled) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const cached = syncFromCache(queryKey, true);
    const fresh = isAdminQueryFresh(queryKey);

    if (cached && fresh && !revalidateOnMount) {
      return;
    }

    void runFetch({ background: !!cached });
  }, [enabled, queryKey, revalidateOnMount, runFetch, syncFromCache]);

  useEffect(() => {
    if (!enabled || !pollIntervalMs || pollIntervalMs <= 0) return;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void revalidate({ force: true });
    };

    document.addEventListener("visibilitychange", tick);
    const id = window.setInterval(tick, pollIntervalMs);
    return () => {
      document.removeEventListener("visibilitychange", tick);
      window.clearInterval(id);
    };
  }, [enabled, pollIntervalMs, revalidate]);

  return {
    data,
    error,
    loading,
    refreshing,
    revalidate,
    mutate,
    invalidate,
  };
}
