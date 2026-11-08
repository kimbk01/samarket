"use client";

import { useMainHubPtrDomain } from "@/lib/layout/use-main-hub-ptr-domain";
import { homePtrStore, runHomePullRefresh } from "@/lib/home/home-pull-refresh-store";
import { useDibayPtrGesture } from "@/lib/ui/ptr/use-dibay-ptr-gesture";

/** 앱 홈 당겨서 새로고침 제스처 — 공통 엔진(`useDibayPtrGesture`) 그대로, 거래·커뮤니티와 같은 규칙 */
export function HomePullRefreshHost() {
  const ptrDomain = useMainHubPtrDomain();
  useDibayPtrGesture({
    enabled: ptrDomain === "home",
    store: homePtrStore,
    rootDatasetKey: "homePtrRoot",
    resetRefreshingOnCleanup: true,
    onRelease: (pulled) => {
      void runHomePullRefresh(pulled);
    },
  });
  return null;
}
