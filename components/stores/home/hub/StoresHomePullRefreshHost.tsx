"use client";

import { useMainHubPtrDomain } from "@/lib/layout/use-main-hub-ptr-domain";
import { useStoresHomePullRefresh } from "@/lib/stores/use-stores-home-pull-refresh";

/** `/stores` 홈 PTR touch 리스너 — `AppStickyHeader` 에서 마운트 (거래 Host와 동일) */
export function StoresHomePullRefreshHost() {
  const ptrDomain = useMainHubPtrDomain();
  useStoresHomePullRefresh(ptrDomain === "stores");
  return null;
}
