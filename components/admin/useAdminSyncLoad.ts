"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";

export type AdminSyncLoadState =
  | { status: "loading" }
  | { status: "ready" }
  | ({ status: "error" } & AdminLoadFailure);

export type AdminSyncLoader = () => Promise<{ ok: boolean; error?: string; httpStatus?: number }>;

/**
 * 서버 번들 로더(`*-sync-client`) 실행 → 로딩 / 준비 / 실패(코드·HTTP 상태) 상태.
 * 실패를 삼키고 기본값을 정상처럼 보여 주던 `.then(() => setHydrated(true))` 대체 (R6).
 * `loader` 는 모듈 수준 함수(참조 고정)를 넘긴다.
 */
export function useAdminSyncLoad(loader: AdminSyncLoader): { state: AdminSyncLoadState; reload: () => void } {
  const [state, setState] = useState<AdminSyncLoadState>({ status: "loading" });
  const seqRef = useRef(0);

  const load = useCallback(() => {
    const seq = ++seqRef.current;
    void loader()
      .then((r) => {
        if (seq !== seqRef.current) return;
        setState(
          r.ok
            ? { status: "ready" }
            : { status: "error", code: adminSafeErrorCode(r.error), httpStatus: r.httpStatus }
        );
      })
      .catch(() => {
        if (seq !== seqRef.current) return;
        setState({ status: "error", code: "network_error" });
      });
  }, [loader]);

  useEffect(() => {
    load();
  }, [load]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    load();
  }, [load]);

  return { state, reload };
}
