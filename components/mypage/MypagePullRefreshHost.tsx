"use client";

import { useMainHubPtrDomain } from "@/lib/layout/use-main-hub-ptr-domain";
import { mypagePtrStore, runMypagePullRefresh } from "@/lib/mypage/mypage-pull-refresh-store";
import { useDibayPtrGesture } from "@/lib/ui/ptr/use-dibay-ptr-gesture";

/**
 * 내정보 홈 당겨서 새로고침 제스처 — 공통 엔진(`useDibayPtrGesture`) 그대로.
 * 내정보 1단은 셸 헤더 자리(스크롤 밖)라 `bindStickyHeader` 로 머리줄 위 당김도 받는다(배달 홈과 같은 방식).
 * 회원 화면(`MyContent`)에서만 마운트 — 비회원 화면은 새로 받을 서버 데이터가 없다.
 */
export function MypagePullRefreshHost() {
  const ptrDomain = useMainHubPtrDomain();
  useDibayPtrGesture({
    enabled: ptrDomain === "mypage",
    store: mypagePtrStore,
    rootDatasetKey: "mypagePtrRoot",
    bindStickyHeader: true,
    resetRefreshingOnCleanup: true,
    onRelease: (pulled) => {
      void runMypagePullRefresh(pulled);
    },
  });
  return null;
}
