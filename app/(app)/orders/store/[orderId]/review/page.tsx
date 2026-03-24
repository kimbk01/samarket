"use client";

import { AppBackButton } from "@/components/navigation/AppBackButton";
import { StoreOrderReviewForm } from "@/components/mypage/StoreOrderReviewForm";
import { useParams } from "next/navigation";

export default function OrdersHubStoreOrderReviewPage() {
  const params = useParams();
  const orderId = typeof params?.orderId === "string" ? params.orderId : "";
  const backHref = orderId
    ? `/orders/store/${encodeURIComponent(orderId)}`
    : "/orders?tab=store";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton backHref={backHref} ariaLabel="이전 화면" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">리뷰 작성</h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="px-4 py-4">
        <StoreOrderReviewForm ordersHub />
      </div>
    </div>
  );
}
