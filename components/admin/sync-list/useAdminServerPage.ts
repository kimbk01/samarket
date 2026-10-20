"use client";

/**
 * 서버 페이지 목록 조회 (R7) — `GET {url}?{apiQueryString}` → `{ ok, items, total }`.
 * 상태: 첫 로딩 / 오류(code + httpStatus) / 준비. 다시 불러오다 실패해도 직전 정상 목록은 지우지 않는다 (지시서 §8-5).
 * `refreshKey` 가 바뀔 때마다 다시 부른다 (`useAdminListQuery().refreshKey` + 외부 갱신 키).
 */

import { useEffect, useRef, useState } from "react";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";

export type AdminServerPageState<T> = {
  loading: boolean;
  error: AdminLoadFailure | null;
  items: T[];
  total: number;
  /** 한 번이라도 정상 응답을 받았는지 */
  loaded: boolean;
};

export function useAdminServerPage<T>(url: string, refreshKey: string): AdminServerPageState<T> {
  const [state, setState] = useState<AdminServerPageState<T>>({
    loading: true,
    error: null,
    items: [],
    total: 0,
    loaded: false,
  });
  const seqRef = useRef(0);

  useEffect(() => {
    const seq = ++seqRef.current;
    setState((s) => ({ ...s, loading: true }));
    void (async () => {
      try {
        const res = await fetch(url, { cache: "no-store", credentials: "include" });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: T[]; total?: number; error?: string };
        if (seq !== seqRef.current) return;
        if (!res.ok || !j.ok || !Array.isArray(j.items)) {
          setState((s) => ({
            ...s,
            loading: false,
            error: { code: adminSafeErrorCode(j.error, "load_failed"), httpStatus: res.status },
          }));
          return;
        }
        setState({ loading: false, error: null, items: j.items, total: Number(j.total ?? j.items.length), loaded: true });
      } catch {
        if (seq !== seqRef.current) return;
        setState((s) => ({ ...s, loading: false, error: { code: "network_error" } }));
      }
    })();
    // refreshKey 가 같은 url 의 강제 재조회 신호
  }, [url, refreshKey]);

  return state;
}
