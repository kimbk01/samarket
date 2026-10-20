"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RecommendationRecordsPage } from "@/lib/recommendation-ops/recommendation-records-contract";
import type { RecordsFetchResult } from "@/lib/recommendation-ops/recommendation-records-client";

export type RecommendationRecordsPageState<T> =
  | { status: "loading"; page: RecommendationRecordsPage<T> | null }
  | { status: "ready"; page: RecommendationRecordsPage<T> }
  | { status: "error"; code: string; httpStatus?: number; page: RecommendationRecordsPage<T> | null };

/**
 * 추천 기록 표 — 서버 페이지 1장 읽기 (limit/offset·total). `key` 가 바뀌면(필터·쪽·크기) 다시 읽는다.
 * 늦게 도착한 이전 요청 응답은 버린다.
 */
export function useRecommendationRecordsPage<T>(
  key: string,
  fetcher: () => Promise<RecordsFetchResult<RecommendationRecordsPage<T>>>
): { state: RecommendationRecordsPageState<T>; reload: () => void } {
  const [state, setState] = useState<RecommendationRecordsPageState<T>>({ status: "loading", page: null });
  const seqRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const load = useCallback(() => {
    const seq = ++seqRef.current;
    setState((prev) => ({ status: "loading", page: prev.page }));
    void fetcherRef.current().then((r) => {
      if (seq !== seqRef.current) return;
      setState((prev) =>
        r.ok
          ? { status: "ready", page: r.value }
          : { status: "error", code: r.error, httpStatus: r.httpStatus, page: prev.page }
      );
    });
  }, []);

  useEffect(() => {
    load();
  }, [key, load]);

  return { state, reload: load };
}
