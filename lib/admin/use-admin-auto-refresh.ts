"use client";

import { useEffect, useRef } from "react";

/**
 * 관리자 화면 주기 갱신 공통 규칙 (자동 갱신 부하 방지).
 * - 탭이 보이지 않으면 멈춘다. 다시 보이면 마지막 실행이 주기보다 오래됐을 때만 한 번 실행한다.
 * - 이전 실행이 끝나지 않았으면 이번 차례는 건너뛴다 (같은 요청 겹침 방지).
 * - `paused` (모달·처리 중 등) 동안은 실행하지 않는다.
 * - 화면을 떠나면(언마운트) 타이머·이벤트를 정리한다.
 * 첫 조회(화면 진입·조건 변경)는 이 훅이 아니라 화면이 직접 한다.
 */
export function useAdminAutoRefresh(
  run: () => Promise<unknown> | void,
  opts: { intervalMs: number; enabled?: boolean; paused?: boolean }
): void {
  const runRef = useRef(run);
  const pausedRef = useRef(opts.paused === true);
  const inFlight = useRef(false);
  const lastRunAt = useRef(Date.now());

  useEffect(() => {
    runRef.current = run;
  }, [run]);
  useEffect(() => {
    pausedRef.current = opts.paused === true;
  }, [opts.paused]);

  const enabled = opts.enabled !== false;
  const { intervalMs } = opts;

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    lastRunAt.current = Date.now();
    const tick = async () => {
      if (document.visibilityState !== "visible" || pausedRef.current || inFlight.current) return;
      inFlight.current = true;
      lastRunAt.current = Date.now();
      try {
        await runRef.current();
      } finally {
        inFlight.current = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRunAt.current >= intervalMs) void tick();
    };
    const id = setInterval(() => void tick(), intervalMs);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, intervalMs]);
}
