"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { StoreOrderReviewForm } from "@/components/mypage/StoreOrderReviewForm";
import { STORE_ORDER_REVIEW_PAGE_ROOT_CLASS } from "@/lib/stores/store-order-review-page-layout";

export default function MypageStoreOrderReviewPage() {
  const { t } = useI18n();
  return (
    <div className={STORE_ORDER_REVIEW_PAGE_ROOT_CLASS}>
      <MySubpageHeader
        inlineChrome
        registerMainTier1={false}
        title={t("route_store_order_review_title")}
        subtitle={t("route_store_order_review_subtitle")}
        backHref="/mypage/store-orders"
        hideCtaStrip
      />
      <StoreOrderReviewForm layout="inline" ordersHub={false} />
    </div>
  );
}
