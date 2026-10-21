"use client";

import { useParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { StoreOrderReviewForm } from "@/components/mypage/StoreOrderReviewForm";
import { STORE_ORDER_REVIEW_PAGE_ROOT_CLASS } from "@/lib/stores/store-order-review-page-layout";

/** 주문 허브 배달주문 리뷰 — viewport lock → local header owns safe-top */
export default function OrdersHubStoreOrderReviewPage() {
  const { t } = useI18n();
  const params = useParams<{ orderId?: string }>();
  const orderId = typeof params?.orderId === "string" ? params.orderId : "";
  /** 직접 진입 폴백 = 전역 1단 계약과 같은 펼친 주문 (`resolve-main-tier1` /orders/store/:id/review) */
  const backHref = orderId ? `/orders?expand=${encodeURIComponent(orderId)}` : "/orders";
  return (
    <div className={STORE_ORDER_REVIEW_PAGE_ROOT_CLASS}>
      <MySubpageHeader
        inlineChrome
        registerMainTier1={false}
        title={t("route_store_order_review_title")}
        subtitle={t("route_store_order_review_subtitle")}
        backHref={backHref}
        hideCtaStrip
      />
      <StoreOrderReviewForm layout="inline" ordersHub />
    </div>
  );
}
