"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** 탐색이 no-op 으로 끝난 경우(같은 URL 등) 잠금을 풀기 위한 상한. */
const NAVIGATION_GUARD_RELEASE_MS = 2_000;

/**
 * 연타 시 `router.push` 가 히스토리를 두 번 쌓지 않도록 — 전환 1회당 탐색 1회.
 * pathname 이 바뀌면(전환 완료) 또는 상한 시간이 지나면 잠금 해제.
 */
export function useSingleNavigationGuard(): (navigate: () => void) => void {
  const pathname = usePathname();
  const lockedRef = useRef(false);
  const releaseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    lockedRef.current = false;
  }, [pathname]);

  useEffect(
    () => () => {
      if (releaseTimerRef.current != null) window.clearTimeout(releaseTimerRef.current);
    },
    []
  );

  return useCallback((navigate: () => void) => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    if (releaseTimerRef.current != null) window.clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = window.setTimeout(() => {
      lockedRef.current = false;
      releaseTimerRef.current = null;
    }, NAVIGATION_GUARD_RELEASE_MS);
    navigate();
  }, []);
}
