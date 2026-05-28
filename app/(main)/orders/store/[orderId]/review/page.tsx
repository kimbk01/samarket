"use client";

import { StoreOrderReviewForm } from "@/components/mypage/StoreOrderReviewForm";
import { STORE_ORDER_REVIEW_PAGE_ROOT_CLASS } from "@/lib/stores/store-order-review-page-layout";

/** 주문 허브(`/orders`) 배달주문 리뷰 — 전역 `RegionBar` + 본문 스크롤·하단 등록 CTA */
export default function OrdersHubStoreOrderReviewPage() {
  return (
    <div className={STORE_ORDER_REVIEW_PAGE_ROOT_CLASS}>
      <StoreOrderReviewForm layout="inline" ordersHub />
    </div>
  );
}
