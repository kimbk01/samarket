"use client";

import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { StoreOrderReviewForm } from "@/components/mypage/StoreOrderReviewForm";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageStoreOrderReviewPage() {
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title="리뷰 작성"
        subtitle="주문 완료 후기를 남겨 주세요"
        backHref="/mypage/store-orders"
        hideCtaStrip
      />
      <div className={`${APP_MAIN_TAB_SCROLL_BODY_CLASS} py-4`}>
        <StoreOrderReviewForm layout="inline" ordersHub={false} />
      </div>
    </div>
  );
}
