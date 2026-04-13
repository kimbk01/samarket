"use client";

import { OrderChatRoomClient } from "@/components/order-chat/OrderChatRoomClient";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";

/** 사장 주문 채팅 — `OrderChatRoomClient` + `/api/order-chat/*` 단일 엔진 */
export function OwnerOrderChatPageClient({
  storeId,
  orderId,
  slug: _slug,
}: {
  storeId: string;
  slug: string;
  orderId: string;
}) {
  const backHref = buildStoreOrdersHref({ storeId, orderId });
  const orderChatsHref = buildStoreOrdersHref({ storeId });
  return (
    <OrderChatRoomClient orderId={orderId} backHref={backHref} orderChatsHref={orderChatsHref} />
  );
}
