"use client";

import { useParams } from "next/navigation";
import { RedirectStoreOrderToUnifiedChat } from "@/components/chats/RedirectStoreOrderToUnifiedChat";

export default function MyStoreOrderChatBridgePage() {
  const params = useParams();
  const orderId = typeof params?.orderId === "string" ? params.orderId : "";
  return <RedirectStoreOrderToUnifiedChat key={orderId || "pending"} variant="buyer" orderId={orderId} />;
}
