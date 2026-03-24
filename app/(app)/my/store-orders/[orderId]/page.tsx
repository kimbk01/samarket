"use client";

import { AppBackButton } from "@/components/navigation/AppBackButton";
import { MyStoreOrderDetailView } from "@/components/mypage/MyStoreOrderDetailView";

export default function MyStoreOrderDetailPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton
          preferHistoryBack
          backHref="/mypage/store-orders"
          ariaLabel="이전 화면"
        />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">주문 상세</h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="px-4 py-4">
        <MyStoreOrderDetailView />
      </div>
    </div>
  );
}
