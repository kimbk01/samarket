"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { fetchOwnerStoreSettlementsDeduped } from "@/lib/business/fetch-owner-store-settlements-deduped";
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

/** 허브 대시보드 — 라우트 prefetch 만 즉시, orders/settlements API 는 background */
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
        trackOwnerDashboardApiStart("settlements", { priority: "background" });
        const t0 = performance.now();
        await Promise.all([
          fetchStoreOrdersListDeduped(sid).catch(() => null),
          fetchOwnerStoreSettlementsDeduped(sid).catch(() => null),
        ]);
        const ms = Math.round(performance.now() - t0);
        trackOwnerDashboardApiDone("orders_list", {
          priority: "background",
          client_duration_ms: ms,
        });
        trackOwnerDashboardApiDone("settlements", {
          priority: "background",
          client_duration_ms: ms,
        });
      },
      {
        afterMs: OWNER_HUB_SECONDARY_AFTER_MS.prefetchOrdersSettlements,
        key: "prefetch_orders_settlements",
      }
    );
  }, [storeId, router]);
}
