"use client";

import { useLayoutEffect } from "react";
import type { OwnerHubDashboardPack } from "@/lib/business/load-owner-hub-dashboard-server";
import { seedOwnerHubDashboardOrdersCache } from "@/lib/stores/owner-hub-dashboard-orders-cache";
import { seedOwnerHubOrderCountsCache } from "@/lib/stores/owner-hub-order-counts-cache";

/**
 * `/stores/owner` RSC `loadOwnerHubDashboardPackServer` 결과를 클라 주문 목록 캐시에 시드.
 */
export function OwnerHubDashboardOrdersCacheSeed({
  storeId,
  pack,
}: {
  storeId: string;
  pack: OwnerHubDashboardPack;
}) {
  seedOwnerHubDashboardOrdersCache(storeId, pack);
  seedOwnerHubOrderCountsCache(storeId, pack.meta);
  useLayoutEffect(() => {
    seedOwnerHubDashboardOrdersCache(storeId, pack);
    seedOwnerHubOrderCountsCache(storeId, pack.meta);
  }, [storeId, pack]);
  return null;
}
