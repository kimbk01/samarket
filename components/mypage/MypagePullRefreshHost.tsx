"use client";

import { useMainHubPtrDomain } from "@/lib/layout/use-main-hub-ptr-domain";
import { useMypagePullRefresh } from "@/lib/mypage/use-mypage-pull-refresh";

/** 내정보 허브 PTR touch 리스너 — `AppStickyHeader` 에서 마운트 */
export function MypagePullRefreshHost() {
  const ptrDomain = useMainHubPtrDomain();
  useMypagePullRefresh(ptrDomain === "mypage");
  return null;
}
