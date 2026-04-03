"use client";

import { StoreOrderDashboardSection } from "@/components/stores/home/StoreOrderDashboardSection";
import type {
  RecentOrderPreview,
  StoreOrderDashboardBuyerState,
} from "@/components/stores/home/StoreOrderDashboardSection";
import { StoreOwnerOpsSection } from "@/components/stores/home/StoreOwnerOpsSection";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { FB } from "@/components/stores/store-facebook-feed-tokens";

/** 내 주문 · 매장 운영 — Facebook 그룹/바로가기 카드형 */
export function StoreHubMyZoneSection({
  buyerState,
  recentOrder,
  ownerStore,
  ownerStoreTabAttention,
  ownerOrderAttention,
}: {
  buyerState: StoreOrderDashboardBuyerState;
  recentOrder: RecentOrderPreview | null;
  ownerStore: StoreRow | null;
  ownerStoreTabAttention: number;
  ownerOrderAttention: number;
}) {
  return (
    <section className={`mt-2 space-y-3 p-3 ${FB.card}`}>
      <div className={`border-b pb-2 ${FB.divider}`}>
        <h2 className={FB.name}>내 주문 · 매장 운영</h2>
      </div>
      <StoreOrderDashboardSection
        embedded
        buyerState={buyerState}
        recentOrder={recentOrder}
      />
      {ownerStore ?
        <StoreOwnerOpsSection
          embedded
          ownerStore={ownerStore}
          ownerStoreTabAttention={ownerStoreTabAttention}
          ownerOrderAttention={ownerOrderAttention}
          hubAttentionSlot={null}
        />
      : null}
    </section>
  );
}
