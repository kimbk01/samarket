"use client";

import {
  runStoresBrowsePullRefresh,
  storesBrowsePtrStore,
} from "@/lib/stores/stores-browse-pull-refresh-store";
import { useDibayPtrGesture } from "@/lib/ui/ptr/use-dibay-ptr-gesture";

/**
 * CONTRACT — `/stores/browse/*` PTR: `/stores` 홈과 동일 touch·임계값.
 * 리스너: scroll body + sticky header. 힌트 UI는 4·5단 사이 `#eac784` 슬롯.
 * 제스처 SSOT: `lib/ui/ptr/use-dibay-ptr-gesture.ts`.
 */
export function useStoresBrowsePullRefresh(enabled: boolean): void {
  useDibayPtrGesture({
    enabled,
    store: storesBrowsePtrStore,
    rootDatasetKey: "storesBrowsePtrRoot",
    bindStickyHeader: true,
    onRelease: (pulled) => {
      void runStoresBrowsePullRefresh(pulled);
    },
  });
}
