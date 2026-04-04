"use client";

import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { OrderChatRoomClient } from "@/components/order-chat/OrderChatRoomClient";

type Props =
  | { variant: "buyer"; orderId: string }
  | { variant: "owner"; storeId: string; slug: string; orderId: string };

/** 주문 채팅 전용 엔진 화면 브리지. */
export function RedirectStoreOrderToUnifiedChat(props: Props) {
  const orderId = props.orderId.trim();
  const backHref =
    props.variant === "buyer"
      ? orderId
        ? `/my/store-orders/${encodeURIComponent(orderId)}`
        : "/my/store-orders"
      : buildStoreOrdersHref({ storeId: props.storeId.trim(), orderId });
  const orderChatsHref =
    props.variant === "buyer" ? "/my/store-orders" : buildStoreOrdersHref({ storeId: props.storeId.trim() });
  return <OrderChatRoomClient orderId={orderId} backHref={backHref} orderChatsHref={orderChatsHref} />;
}
