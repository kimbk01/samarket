"use client";

/**
 * 서버 페이지 목록 조회 훅 (R7 목록 표준 · 회원·고객지원·알림·결제/포인트).
 *
 * - `url` 이 바뀌거나 `refreshKey` 가 바뀌면 다시 불러온다. `url === null` 이면 조회하지 않는다.
 * - 응답 `{ ok, [rowsKey]: T[], total }` — `total` 이 없으면 행 수.
 * - 실패해도 직전 정상 목록·총 건수를 지우지 않는다 (지시서 §8-5). 오류는 `error` 로만 알린다.
 * - `error.httpStatus` 를 그대로 넘겨 `AdminErrorState` 가 403 을 권한 없음으로 그린다.
 */

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin/admin-fetch-client";

export type MemberOpsLoadError = { code: string; httpStatus?: number };

export type MemberOpsPagedFetch<T> = {
  rows: T[];
  total: number;
  /** 응답 원문 (목록 외 부가 필드 — 요약 수치 등). 첫 성공 전에는 null. */
  json: Record<string, unknown> | null;
  /** 조회 중 */
  loading: boolean;
  /** 한 번이라도 성공했는지 — 첫 로딩과 재조회를 구분 */
  loaded: boolean;
  error: MemberOpsLoadError | null;
  reload: () => void;
};

export function useMemberOpsPagedFetch<T>(
  url: string | null,
  rowsKey: string,
  refreshKey: string | number = 0
): MemberOpsPagedFetch<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [json, setJson] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(url !== null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<MemberOpsLoadError | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (url === null) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await adminFetch(url, { credentials: "include", cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled) return;
        if (!res.ok || body.ok === false) {
          setError({ code: typeof body.error === "string" && body.error ? body.error : "load_failed", httpStatus: res.status });
          return;
        }
        const list = Array.isArray(body[rowsKey]) ? (body[rowsKey] as T[]) : [];
        setRows(list);
        setTotal(typeof body.total === "number" ? body.total : list.length);
        setJson(body);
        setError(null);
        setLoaded(true);
      } catch {
        if (!cancelled) setError({ code: "network_error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, rowsKey, refreshKey, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { rows, total, json, loading, loaded, error, reload };
}
