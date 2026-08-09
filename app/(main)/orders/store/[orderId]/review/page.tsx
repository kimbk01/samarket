"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { StoreOrderReviewForm } from "@/components/mypage/StoreOrderReviewForm";
import { STORE_ORDER_REVIEW_PAGE_ROOT_CLASS } from "@/lib/stores/store-order-review-page-layout";

/** 주문 허브 배달주문 리뷰 — viewport lock → local header owns safe-top */
export default function OrdersHubStoreOrderReviewPage() {
  const { t } = useI18n();
  return (
    <div className={STORE_ORDER_REVIEW_PAGE_ROOT_CLASS}>
      <MySubpageHeader
        inlineChrome
        registerMainTier1={false}
        title={t("route_store_order_review_title")}
        subtitle={t("route_store_order_review_subtitle")}
        backHref="/orders"
        hideCtaStrip
      />
      <StoreOrderReviewForm layout="inline" ordersHub />
    </div>
  );
}
