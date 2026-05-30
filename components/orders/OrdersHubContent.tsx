"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  BUYER_DELIVERY_ORDERS_HEADER_OFFSET_CLASS,
  BuyerDeliveryOrdersHeader,
} from "@/components/orders/BuyerDeliveryOrdersHeader";
import { MyStoreOrdersView } from "@/components/mypage/MyStoreOrdersView";

function OrdersHubListBody() {
  const searchParams = useSearchParams();
  const expandOrderId = searchParams?.get("expand")?.trim() || null;

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${BUYER_DELIVERY_ORDERS_HEADER_OFFSET_CLASS}`}>
      <MyStoreOrdersView variant="deliveryHub" initialExpandOrderId={expandOrderId} />
    </div>
  );
}

/** 구매자 배달 주문 목록 — `/stores/owner/orders` 와 동일 헤더·본문 톤, 거래·채팅 탭 없음 */
export function OrdersHubContent() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f6f6f6]">
      <BuyerDeliveryOrdersHeader />
      <Suspense
        fallback={
          <div className={`flex min-h-[40vh] items-center justify-center ${BUYER_DELIVERY_ORDERS_HEADER_OFFSET_CLASS} text-sm text-[#6B7280]`}>
            불러오는 중…
          </div>
        }
      >
        <OrdersHubListBody />
      </Suspense>
    </div>
  );
}
