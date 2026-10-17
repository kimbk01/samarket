"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { fetchStoreOrdersListDeduped } from "@/lib/stores/fetch-store-orders-list-deduped";
import {
  OWNER_HUB_SECONDARY_AFTER_MS,
  scheduleOwnerHubSecondaryFetch,
} from "@/lib/business/owner-hub-secondary-fetch-queue";
import {
  markOwnerDashboardBackgroundStart,
  trackOwnerDashboardApiDone,
  trackOwnerDashboardApiStart,
} from "@/lib/business/owner-dashboard-waterfall";

/**
 * 허브 대시보드 — 라우트 prefetch 만 즉시, orders API 는 background.
 * 정산 화면은 수수료 원장(commission-ledger)을 직접 조회하므로 레거시 store-settlements API 는 미리 받지 않는다.
 */
export function useOwnerHubSubroutePrefetch(storeId: string | null | undefined) {
  const router = useRouter();

  useEffect(() => {
    const sid = (storeId ?? "").trim();
    if (!sid) return;

    const hrefs = [
      OwnerRoutes.orders(sid),
      OwnerRoutes.settlements(sid),
      OwnerRoutes.inquiries(sid),
      OwnerRoutes.products(sid),
    ];
    for (const href of hrefs) {
      try {
        router.prefetch(href);
      } catch {
        /* ignore */
      }
    }

    scheduleOwnerHubSecondaryFetch(
      async () => {
        markOwnerDashboardBackgroundStart();
        trackOwnerDashboardApiStart("orders_list", { priority: "background" });
        const t0 = performance.now();
        await fetchStoreOrdersListDeduped(sid).catch(() => null);
        trackOwnerDashboardApiDone("orders_list", {
          priority: "background",
          client_duration_ms: Math.round(performance.now() - t0),
        });
      },
      {
        afterMs: OWNER_HUB_SECONDARY_AFTER_MS.prefetchOrdersSettlements,
        key: "prefetch_orders_settlements",
      }
    );
  }, [storeId, router]);
}
