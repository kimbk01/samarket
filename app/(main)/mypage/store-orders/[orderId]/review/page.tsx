"use client";

import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { StoreOrderReviewForm } from "@/components/mypage/StoreOrderReviewForm";
import { APP_MYPAGE_SUBPAGE_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageStoreOrderReviewPage() {
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="리뷰 작성"
        subtitle="주문 완료 후기를 남겨 주세요"
        backHref="/mypage/store-orders"
        hideCtaStrip
      />
      <div className={`${APP_MYPAGE_SUBPAGE_BODY_CLASS} py-4 pb-28`}>
        <StoreOrderReviewForm layout="inline" ordersHub={false} />
      </div>
    </div>
  );
}
