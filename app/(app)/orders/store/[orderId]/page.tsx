"use client";

import { AppBackButton } from "@/components/navigation/AppBackButton";
import { MyStoreOrderDetailView } from "@/components/mypage/MyStoreOrderDetailView";

/** 주문 허브(`/orders`) 배달주문 탭과 동일 맥락에서 보는 매장 주문 상세 */
export default function OrdersHubStoreOrderDetailPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton preferHistoryBack backHref="/orders?tab=store" ariaLabel="이전 화면" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">주문 상세</h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="px-4 py-4">
        <MyStoreOrderDetailView ordersHub />
      </div>
    </div>
  );
}
