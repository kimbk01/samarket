"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const TAB_CLASS =
  "flex min-h-[52px] min-w-0 flex-1 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-sm font-semibold text-sam-fg";

/**
 * Delivery Activity Hub — document icon entry.
 * Tier1 owns title/back → `/stores`. Tabs use existing AppRouteTransition (Link only).
 */
export function DeliveryActivityHub() {
  const { safeT } = useI18n();
  const title = safeT("store_coupon_delivery_activity_title", {
    fallbackKo: "주문·쿠폰",
    fallbackEn: "Orders & coupons",
  });

  return (
    <div className="flex min-h-0 flex-col bg-sam-app px-4 py-4" data-delivery-activity-hub="1">
      <nav className="flex min-w-0 flex-col gap-3" data-delivery-activity-hub-tabs="1" aria-label={title}>
        <Link
          href="/orders"
          prefetch={false}
          className={TAB_CLASS}
          data-delivery-activity-tab="orders"
        >
          {safeT("store_coupon_delivery_activity_orders", {
            fallbackKo: "주문 내역",
            fallbackEn: "Orders",
          })}
        </Link>
        <Link
          href="/mypage/coupons?from=delivery-activity"
          prefetch={false}
          className={TAB_CLASS}
          data-delivery-activity-tab="coupons"
        >
          {safeT("store_coupon_delivery_activity_coupons", {
            fallbackKo: "쿠폰 내역",
            fallbackEn: "Coupons",
          })}
        </Link>
        <Link
          href="/mypage/gift-certificates?from=delivery-activity"
          prefetch={false}
          className={TAB_CLASS}
          data-delivery-activity-tab="gift-certificates"
        >
          {safeT("store_coupon_delivery_activity_gifts", {
            fallbackKo: "상품권",
            fallbackEn: "Gift certificates",
          })}
        </Link>
      </nav>
    </div>
  );
}
