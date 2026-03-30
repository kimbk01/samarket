"use client";

import { useParams } from "next/navigation";
import { RedirectStoreOrderToUnifiedChat } from "@/components/chats/RedirectStoreOrderToUnifiedChat";

export default function OrdersHubStoreOrderChatBridgePage() {
  const params = useParams();
  const orderId = typeof params?.orderId === "string" ? params.orderId : "";
  return <RedirectStoreOrderToUnifiedChat variant="buyer" orderId={orderId} />;
}
