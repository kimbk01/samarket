"use client";

import { useLayoutEffect } from "react";
import type { OwnerHubDashboardPack } from "@/lib/business/load-owner-hub-dashboard-server";
import { seedOwnerHubDashboardOrdersCache } from "@/lib/stores/owner-hub-dashboard-orders-cache";
/**
 * `/stores/owner` RSC `loadOwnerHubDashboardPackServer` 결과를 타임라인 캐시에만 시드.
 * KPI 숫자(진행 중·매출 등)는 `GET …/order-counts` 가 SoT — 타임라인 meta 만으로 order-counts 캐시를 채우지 않는다.
 */
export function OwnerHubDashboardOrdersCacheSeed({
  storeId,
  pack,
}: {
  storeId: string;
  pack: OwnerHubDashboardPack;
}) {
  seedOwnerHubDashboardOrdersCache(storeId, pack);
  useLayoutEffect(() => {
    seedOwnerHubDashboardOrdersCache(storeId, pack);
  }, [storeId, pack]);
  return null;
}
