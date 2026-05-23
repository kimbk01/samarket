"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoreOrderDashboardSection } from "@/components/stores/home/StoreOrderDashboardSection";
import type {
  RecentOrderPreview,
  StoreOrderDashboardBuyerState,
} from "@/components/stores/home/StoreOrderDashboardSection";

/** 배달 홈 — 구매자 주문만 (매장 운영 섹션 없음) */
export function StoresHomeBuyerMyZone({
  buyerState,
  recentOrder,
  compact = false,
}: {
  buyerState: StoreOrderDashboardBuyerState;
  recentOrder: RecentOrderPreview | null;
  /** 진행 중 주문 배너 — hero 위 compact */
  compact?: boolean;
}) {
  const { t } = useI18n();
  if (buyerState.kind === "idle") return null;

  if (compact) {
    if (buyerState.kind !== "ready" || buyerState.activeOrders <= 0) return null;
    return (
      <section aria-label={t("store_hub_my_zone_title")}>
        <StoreOrderDashboardSection embedded buyerState={buyerState} recentOrder={recentOrder} />
      </section>
    );
  }

  return (
    <section className="rounded-[var(--delivery-radius)] border border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)] p-3">
      <h2 className="mb-2 text-[15px] font-bold text-[color:var(--delivery-text-main)]">
        {t("store_hub_my_zone_title")}
      </h2>
      <StoreOrderDashboardSection embedded buyerState={buyerState} recentOrder={recentOrder} />
    </section>
  );
}
