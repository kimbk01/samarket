"use client";

import {
  messengerPtrStore,
  runMessengerPullRefresh,
} from "@/lib/community-messenger/messenger-pull-refresh-store";
import { useDibayPtrGesture } from "@/lib/ui/ptr/use-dibay-ptr-gesture";

/**
 * 메신저 허브는 hub body 가 `overflow-y:hidden`(child-scroll-lock)이고 실제 스크롤은 목록 컨테이너다.
 * 스크롤 루트만 보면 목록이 내려가 있어도 최상단으로 오판하므로 목록 컨테이너도 함께 판정한다.
 */
export const MESSENGER_HUB_LIST_SCROLL_SELECTOR = "[data-messenger-hub-list-scroll]";

/**
 * CONTRACT — `/community-messenger` PTR: 목록 scrollTop=0 이면 세로 당김 → 1단 아래 힌트 슬롯 확장.
 * 제스처 SSOT: `lib/ui/ptr/use-dibay-ptr-gesture.ts`.
 */
export function useMessengerPullRefresh(enabled: boolean): void {
  useDibayPtrGesture({
    enabled,
    store: messengerPtrStore,
    rootDatasetKey: "messengerPtrRoot",
    resetRefreshingOnCleanup: true,
    extraScrollContainerSelector: MESSENGER_HUB_LIST_SCROLL_SELECTOR,
    onRelease: (pulled) => {
      void runMessengerPullRefresh(pulled);
    },
  });
}
