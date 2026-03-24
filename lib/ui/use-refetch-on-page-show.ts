"use client";

import { useEffect, useRef } from "react";

export type RefetchOnRestoreOptions = {
  /** 탭/앱 전환 후 다시 보일 때 갱신 (기본 true) */
  enableVisibilityRefetch?: boolean;
  visibilityDebounceMs?: number;
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
  const refetchRef = useRef(refetch);
  const visTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    const run = () => void refetchRef.current();

    const onPageShow = (e: Event) => {
      const pe = e as PageTransitionEvent;
      if (pe.persisted) run();
    };

    const onVisibility = () => {
      if (!enableVis || document.visibilityState !== "visible") return;
      if (visTimerRef.current) clearTimeout(visTimerRef.current);
      visTimerRef.current = setTimeout(() => {
        visTimerRef.current = null;
        run();
      }, debounceMs);
    };

    window.addEventListener("pageshow", onPageShow);
    if (enableVis) document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      if (enableVis) document.removeEventListener("visibilitychange", onVisibility);
      if (visTimerRef.current) clearTimeout(visTimerRef.current);
    };
  }, [debounceMs, enableVis]);
}
