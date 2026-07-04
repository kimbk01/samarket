"use client";

import { useMainHubPtrDomain } from "@/lib/layout/use-main-hub-ptr-domain";
import { useMessengerPullRefresh } from "@/lib/community-messenger/use-messenger-pull-refresh";

/** 메신저 허브 PTR touch 리스너 */
export function MessengerPullRefreshHost() {
  const ptrDomain = useMainHubPtrDomain();
  useMessengerPullRefresh(ptrDomain === "messenger");
  return null;
}
