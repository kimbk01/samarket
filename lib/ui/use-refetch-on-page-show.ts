"use client";

import { useEffect, useRef } from "react";

export type RefetchOnRestoreOptions = {
  /** 탭/앱 전환 후 다시 보일 때 갱신 (기본 true) */
  enableVisibilityRefetch?: boolean;
  visibilityDebounceMs?: number;
  /**
   * 같은 문서가 보이는 상태에서 창 포커스만 바뀔 때(IDE 등 다른 앱 갔다 옴) — visibility 이벤트 없이 복귀하는 경우 보조.
   * 기본 false(기존 소비자 부하·중복 호출 방지).
   */
  enableWindowFocusRefetch?: boolean;
  windowFocusDebounceMs?: number;
};

/**
 * 뒤로 가기·bfcache·다른 탭 복귀 후에도 화면이 오래된 데이터로 남지 않게 합니다.
 * - `pageshow` + `persisted`: 브라우저 뒤로 가기 bfcache 복원
 * - `visibilitychange` → visible: PWA/모바일에서 다른 앱 갔다 올 때 (디바운스)
 *
 * 갱신 시 깜빡임을 줄이려면 `refetch` 안에서 `silent` 등으로 로딩 스켈레톤을 생략하세요.
 */
export function useRefetchOnPageShowRestore(
  refetch: () => void | Promise<void>,
  options?: RefetchOnRestoreOptions
): void {
  const enableVis = options?.enableVisibilityRefetch !== false;
  const debounceMs = options?.visibilityDebounceMs ?? 450;
  const enableFocus = options?.enableWindowFocusRefetch === true;
  const focusDebounceMs = options?.windowFocusDebounceMs ?? 400;
  const refetchRef = useRef(refetch);
  /** visibility·focus·bfcache 복귀가 같은 틱에 겹쳐도 refetch 는 마지막 이벤트 기준 1회만 */
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    const scheduleRestore = (ms: number) => {
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = setTimeout(() => {
        restoreTimerRef.current = null;
        void refetchRef.current();
      }, ms);
    };

    const onPageShow = (e: Event) => {
      const pe = e as PageTransitionEvent;
      if (pe.persisted) scheduleRestore(debounceMs);
    };

    const onVisibility = () => {
      if (!enableVis || document.visibilityState !== "visible") return;
      scheduleRestore(debounceMs);
    };

    const onFocus = () => {
      if (!enableFocus) return;
      scheduleRestore(focusDebounceMs);
    };

    window.addEventListener("pageshow", onPageShow);
    if (enableVis) document.addEventListener("visibilitychange", onVisibility);
    if (enableFocus) window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      if (enableVis) document.removeEventListener("visibilitychange", onVisibility);
      if (enableFocus) window.removeEventListener("focus", onFocus);
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
    };
  }, [debounceMs, enableFocus, enableVis, focusDebounceMs]);
}
