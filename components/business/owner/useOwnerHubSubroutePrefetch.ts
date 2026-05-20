"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { fetchOwnerStoreSettlementsDeduped } from "@/lib/business/fetch-owner-store-settlements-deduped";
import { fetchStoreOrdersListDeduped } from "@/lib/stores/fetch-store-orders-list-deduped";

/** 허브 대시보드 — 「전체 보기」 대상 라우트·핵심 API 선로딩 */
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

    void fetchStoreOrdersListDeduped(sid).catch(() => {});
    void fetchOwnerStoreSettlementsDeduped(sid).catch(() => {});
  }, [storeId, router]);
}
