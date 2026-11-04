"use client";

/**
 * 서버 페이지 목록 조회 훅 (R7 목록 표준 · 회원·고객지원·알림·결제/포인트).
 *
 * - `url` 이 바뀌거나 `refreshKey` 가 바뀌면 다시 불러온다. `url === null` 이면 조회하지 않는다.
 * - 응답 `{ ok, [rowsKey]: T[], total }` — `total` 이 없으면 행 수.
 * - 실패해도 직전 정상 목록·총 건수를 지우지 않는다 (지시서 §8-5). 오류는 `error` 로만 알린다.
 * - `error.httpStatus` 를 그대로 넘겨 `AdminErrorState` 가 403 을 권한 없음으로 그린다.
 * - `options.once` (선택 · P-5): 비싼 부가 쿼리(예: 기간 합계 `summary=1`)를 `once.key` 가 바뀌었을 때·같은 주소
 *   재조회(`reload`·`refreshKey`) 때만 붙인다. 쪽 이동처럼 주소만 바뀐 요청에는 붙이지 않고, 마지막으로 받은 응답은
 *   `onceJson` 에 남는다. 실패하면 `onceJson` 을 비우고 다음 요청에서 다시 받는다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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
  /** `options.once` 를 붙여 받은 마지막 응답 원문 (없으면 null). */
  onceJson: Record<string, unknown> | null;
  /** `options.once` 를 붙인 요청이 진행 중 — 이전 값을 새 조건 아래 보이지 않게 숨기는 데 쓴다. */
  oncePending: boolean;
};

export type MemberOpsPagedFetchOptions = {
  once?: { key: string; query: string };
};

export function useMemberOpsPagedFetch<T>(
  url: string | null,
  rowsKey: string,
  refreshKey: string | number = 0,
  options?: MemberOpsPagedFetchOptions
): MemberOpsPagedFetch<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [json, setJson] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(url !== null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<MemberOpsLoadError | null>(null);
  const [nonce, setNonce] = useState(0);
  const onceKey = options?.once?.key ?? null;
  const onceQuery = options?.once?.query ?? "";
  const [onceJson, setOnceJson] = useState<Record<string, unknown> | null>(null);
  const [oncePending, setOncePending] = useState(onceKey !== null && url !== null);
  /** `once` 를 받아 둔 key — 다르면 다음 요청에 붙인다 */
  const onceDoneKeyRef = useRef<string | null>(null);
  /** 직전 요청 주소 — 같은 주소 재실행 = 새로고침(`reload`·`refreshKey`) */
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (url === null) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const sameUrlRerun = lastUrlRef.current === url;
    lastUrlRef.current = url;
    const withOnce = onceKey !== null && (onceDoneKeyRef.current !== onceKey || sameUrlRerun);
    const requestUrl = withOnce && onceQuery ? `${url}${url.includes("?") ? "&" : "?"}${onceQuery}` : url;
    setLoading(true);
    if (withOnce) setOncePending(true);
    (async () => {
      try {
        const res = await adminFetch(requestUrl, { credentials: "include", cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled) return;
        if (!res.ok || body.ok === false) {
          setError({ code: typeof body.error === "string" && body.error ? body.error : "load_failed", httpStatus: res.status });
          if (onceKey !== null) {
            onceDoneKeyRef.current = null;
            setOnceJson(null);
            setOncePending(false);
          }
          return;
        }
        const list = Array.isArray(body[rowsKey]) ? (body[rowsKey] as T[]) : [];
        setRows(list);
        setTotal(typeof body.total === "number" ? body.total : list.length);
        setJson(body);
        setError(null);
        setLoaded(true);
        if (withOnce) {
          onceDoneKeyRef.current = onceKey;
          setOnceJson(body);
          setOncePending(false);
        }
      } catch {
        if (!cancelled) {
          setError({ code: "network_error" });
          if (onceKey !== null) {
            onceDoneKeyRef.current = null;
            setOnceJson(null);
            setOncePending(false);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, rowsKey, refreshKey, nonce, onceKey, onceQuery]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { rows, total, json, loading, loaded, error, reload, onceJson, oncePending };
}
