"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function MyStoreOrderChatBridgePage() {
  const params = useParams();
  const router = useRouter();
  const orderId = typeof params?.orderId === "string" ? params.orderId : "";

  useEffect(() => {
    if (!orderId) return;
    router.replace(`/mypage/store-orders/${encodeURIComponent(orderId)}/chat`);
  }, [orderId, router]);

  return null;
}
