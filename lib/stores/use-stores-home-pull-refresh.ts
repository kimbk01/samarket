"use client";

import {
  runStoresHomePullRefresh,
  storesHomePtrStore,
} from "@/lib/stores/stores-home-pull-refresh-store";
import { useDibayPtrGesture } from "@/lib/ui/ptr/use-dibay-ptr-gesture";

/**
 * CONTRACT — `/stores` PTR: scrollTop=0 이면 **헤더·카테고리·본문** 어디서든 세로 당김 → 헤더만 확장.
 * - 리스너: `[data-main-hub-scroll-body]` + `[data-app-sticky-header]` (배달 sticky chrome 밖 당김).
 * - `capture` + `passive:false` touchmove: iOS 에서만 preventDefault 가 당김에 먹힘.
 * DO NOT: 스크롤 본문 `transform` / `translateY` · `window` 전역 리스너.
 * 제스처 SSOT: `lib/ui/ptr/use-dibay-ptr-gesture.ts`.
 */
export function useStoresHomePullRefresh(enabled: boolean): void {
  useDibayPtrGesture({
    enabled,
    store: storesHomePtrStore,
    rootDatasetKey: "storesHomePtrRoot",
    bindStickyHeader: true,
    onRelease: (pulled) => {
      void runStoresHomePullRefresh(pulled);
    },
  });
}
