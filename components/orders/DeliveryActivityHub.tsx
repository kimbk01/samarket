"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";

const TAB_CLASS =
  "flex min-h-[52px] min-w-0 flex-1 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-sm font-semibold text-sam-fg";

/**
 * Delivery Activity Hub — document icon entry.
 * Tier1 owns title/back → `/stores`. Tabs use existing AppRouteTransition (Link only).
 * Gift section: Wallet ↔ Mall bidirectional (U2).
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

        <section
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-3"
          data-delivery-activity-gift-section="1"
        >
          <h2 className="mb-2 text-sm font-semibold text-sam-fg">
            {safeT("gift_u2_activity_section_title", {
              fallbackKo: "상품권",
              fallbackEn: "Gift certificates",
            })}
          </h2>
          <div className="flex min-w-0 flex-col gap-2">
            <Link
              href="/mypage/gift-certificates?from=delivery-activity"
              prefetch={false}
              className={`${Sam.btn.primary} flex min-h-[48px] items-center justify-center px-3 text-sm`}
              data-delivery-activity-tab="gift-certificates"
              data-delivery-activity-gift-wallet="1"
            >
              {safeT("gift_u2_activity_my_gifts", {
                fallbackKo: "내 상품권",
                fallbackEn: "My gift certificates",
              })}
            </Link>
            <Link
              href="/stores/gift-mall?from=delivery-activity"
              prefetch={false}
              className={`${Sam.btn.secondary} flex min-h-[48px] items-center justify-center px-3 text-sm`}
              data-delivery-activity-gift-mall="1"
            >
              {safeT("gift_u2_activity_buy", {
                fallbackKo: "상품권 구매하기",
                fallbackEn: "Buy gift certificates",
              })}
            </Link>
          </div>
        </section>
      </nav>
    </div>
  );
}
