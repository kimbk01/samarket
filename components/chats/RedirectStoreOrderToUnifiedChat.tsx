"use client";

import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { OrderChatRoomClient } from "@/components/order-chat/OrderChatRoomClient";
import type { OrderChatSnapshot } from "@/lib/order-chat/types";

type Props =
  | { variant: "buyer"; orderId: string; initialSnapshot?: OrderChatSnapshot | null }
  | { variant: "owner"; storeId: string; slug: string; orderId: string; initialSnapshot?: OrderChatSnapshot | null };

/** 주문 채팅 전용 엔진 화면 브리지. */
export function RedirectStoreOrderToUnifiedChat(props: Props) {
  const orderId = props.orderId.trim();
  const backHref =
    props.variant === "buyer"
      ? orderId
        ? `/mypage/store-orders/${encodeURIComponent(orderId)}`
        : "/mypage/store-orders"
      : buildStoreOrdersHref({ storeId: props.storeId.trim(), orderId });
  const orderChatsHref =
    props.variant === "buyer" ? "/mypage/store-orders" : buildStoreOrdersHref({ storeId: props.storeId.trim() });
  return (
    <OrderChatRoomClient
      key={orderId}
      orderId={orderId}
      backHref={backHref}
      orderChatsHref={orderChatsHref}
      initialSnapshot={props.initialSnapshot ?? null}
    />
  );
}
