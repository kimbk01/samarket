"use client";

import { useParams } from "next/navigation";
import { OrderChatRoomClient } from "@/components/order-chat/OrderChatRoomClient";

export default function OrdersHubStoreOrderChatBridgePage() {
  const params = useParams();
  const orderId = typeof params?.orderId === "string" ? params.orderId : "";
  return (
    <OrderChatRoomClient
      key={orderId || "pending"}
      orderId={orderId}
      backHref={orderId ? `/orders/store/${encodeURIComponent(orderId)}` : "/orders"}
      orderChatsHref="/orders"
    />
  );
}
