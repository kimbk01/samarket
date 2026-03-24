"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { RedirectStoreOrderToUnifiedChat } from "@/components/chats/RedirectStoreOrderToUnifiedChat";
import { MemberOrderChatPageClient } from "@/components/member-orders/MemberOrderChatPageClient";
import { findSharedOrder } from "@/lib/shared-orders/shared-order-store";

export default function MypageStoreOrderChatBridgePage() {
  const params = useParams();
  const router = useRouter();
  const orderId = typeof params?.orderId === "string" ? params.orderId : "";
  const simOrder = useMemo(() => (orderId ? findSharedOrder(orderId) : undefined), [orderId]);

  useEffect(() => {
    if (!orderId) router.replace("/mypage/store-orders");
  }, [orderId, router]);

  if (!orderId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#e8e6ef] text-sm text-gray-500">
        이동 중…
      </div>
    );
  }

  if (!simOrder) {
    return <RedirectStoreOrderToUnifiedChat variant="buyer" orderId={orderId} />;
  }

  return <MemberOrderChatPageClient orderId={orderId} />;
}
