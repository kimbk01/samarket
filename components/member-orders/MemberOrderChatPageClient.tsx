"use client";

import { OrderChatRoomClient } from "@/components/order-chat/OrderChatRoomClient";

const BASE = "/my/store-orders";

/** 구매자 주문 채팅 — `OrderChatRoomClient` + `/api/order-chat/*` 단일 엔진 */
export function MemberOrderChatPageClient({ orderId }: { orderId: string }) {
  return (
    <OrderChatRoomClient
      orderId={orderId}
      backHref={`${BASE}/${encodeURIComponent(orderId)}`}
      orderChatsHref={BASE}
    />
  );
}
