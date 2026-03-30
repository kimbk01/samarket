"use client";

import { MyStoreOrderDetailView } from "@/components/mypage/MyStoreOrderDetailView";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

/** 주문 허브(`/orders`) 배달주문 탭과 동일 맥락에서 보는 매장 주문 상세 — 상단은 전역 `RegionBar`(주문 상세·뒤로)만 사용 */
export default function OrdersHubStoreOrderDetailPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className={`w-full min-w-0 py-4 ${APP_MAIN_GUTTER_X_CLASS}`}>
        <MyStoreOrderDetailView ordersHub />
      </div>
    </div>
  );
}
