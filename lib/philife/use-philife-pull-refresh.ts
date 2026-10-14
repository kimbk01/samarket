"use client";

import { philifePtrStore, runPhilifePullRefresh } from "@/lib/philife/philife-pull-refresh-store";
import { useDibayPtrGesture } from "@/lib/ui/ptr/use-dibay-ptr-gesture";

/**
 * CONTRACT — `/philife` PTR: scrollTop=0 이면 세로 당김 → 1단·2단(주제 탭) 사이 힌트 슬롯 확장.
 * 제스처 SSOT: `lib/ui/ptr/use-dibay-ptr-gesture.ts`. `pathname` 기준 단일 도메인과 함께 사용.
 */
export function usePhilifePullRefresh(enabled: boolean): void {
  useDibayPtrGesture({
    enabled,
    store: philifePtrStore,
    rootDatasetKey: "philifePtrRoot",
    resetRefreshingOnCleanup: true,
    onRelease: (pulled) => {
      void runPhilifePullRefresh(pulled);
    },
  });
}
