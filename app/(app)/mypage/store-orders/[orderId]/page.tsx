"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { MemberOrderDetail } from "@/components/member-orders/MemberOrderDetail";
import { getDemoBuyerUserId, getMemberOrder } from "@/lib/member-orders/member-order-store";
import { useMemberOrdersVersion } from "@/lib/member-orders/use-member-orders-store";

const LIST_HREF = "/mypage/store-orders";

export default function MypageStoreOrderDetailBridgePage() {
  const params = useParams();
  const router = useRouter();
  const v = useMemberOrdersVersion();
  const orderId = typeof params?.orderId === "string" ? params.orderId : "";
  const buyerId = getDemoBuyerUserId();
  const order = useMemo(() => {
    void v;
    return getMemberOrder(buyerId, orderId);
  }, [buyerId, orderId, v]);

  useEffect(() => {
    if (!orderId) {
      router.replace(LIST_HREF);
      return;
    }
    if (!order) {
      router.replace(`/my/store-orders/${encodeURIComponent(orderId)}`);
    }
  }, [orderId, order, router]);

  if (!orderId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500">
        이동 중…
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500">
        이동 중…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-4 py-3">
        <AppBackButton preferHistoryBack backHref={LIST_HREF} ariaLabel="이전 화면" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-gray-900">주문 상세</h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="px-4 py-4">
        <MemberOrderDetail buyerUserId={buyerId!} order={order} listHref={LIST_HREF} />
      </div>
    </div>
  );
}
