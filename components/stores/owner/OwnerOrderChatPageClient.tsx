"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { ChatHubTopTabs } from "@/components/order-chat/ChatHubTopTabs";
import { OrderChatHeader } from "@/components/order-chat/OrderChatHeader";
import { OrderChatMessageList } from "@/components/order-chat/OrderChatMessageList";
import { OrderChatProgressStrip } from "@/components/order-chat/OrderChatProgressStrip";
import type { OrderChatFlow } from "@/lib/shared-order-chat/chat-message-builder";
import { OwnerChatInput } from "@/components/order-chat/OwnerChatInput";
import {
  useOrderChatReadSignature,
  useOrderChatVersion,
} from "@/components/order-chat/use-order-chat-version";
import { findSharedOrder } from "@/lib/shared-orders/shared-order-store";
import {
  findOrderChatRoomByOrderId,
  listMessagesForOrder,
  markOrderChatReadAsOwner,
  sendOrderChatTextFromOwner,
} from "@/lib/shared-order-chat/shared-chat-store";
import { getMockSession } from "@/lib/mock-auth/mock-auth-store";
import { useMockAuthVersion } from "@/lib/mock-auth/use-mock-auth-version";
import { useOwnerOrdersVersion } from "@/lib/store-owner/use-owner-orders-store";

export function OwnerOrderChatPageClient({
  storeId,
  slug,
  orderId,
}: {
  storeId: string;
  slug: string;
  orderId: string;
}) {
  const av = useMockAuthVersion();
  const cv = useOrderChatVersion();
  const readSig = useOrderChatReadSignature(orderId);
  const ov = useOwnerOrdersVersion();
  const ownerId = useMemo(() => {
    void av;
    const s = getMockSession();
    return s.role === "owner" ? s.userId : null;
  }, [av]);
  const [toast, setToast] = useState<string | null>(null);

  const order = useMemo(() => {
    void ov;
    return findSharedOrder(orderId);
  }, [orderId, ov]);

  const messages = useMemo(() => {
    void cv;
    return listMessagesForOrder(orderId);
  }, [orderId, cv]);

  const chatBlocked = useMemo(() => {
    void cv;
    return findOrderChatRoomByOrderId(orderId)?.room_status === "blocked";
  }, [cv, orderId]);

  useEffect(() => {
    if (order && ownerId && order.store_id === storeId && order.owner_user_id === ownerId) {
      markOrderChatReadAsOwner(orderId, ownerId, storeId);
    }
  }, [readSig, order, orderId, ownerId, storeId]);

  const detailHref = `/my/business/store-orders?order_id=${encodeURIComponent(orderId)}`;

  if (!ownerId) {
    return (
      <div className="min-h-screen bg-[#f3f4f6] px-4 py-16 text-center text-sm text-amber-900">
        매장(오너) 역할로 전환한 뒤 이용해 주세요.
        <Link href="/my/business/store-orders" className="mt-4 block text-violet-700 underline">
          주문 목록
        </Link>
      </div>
    );
  }

  if (!order || order.store_id !== storeId || order.owner_user_id !== ownerId) {
    return (
      <div className="min-h-screen bg-[#f3f4f6] px-4 py-16 text-center text-sm text-sam-muted">
        채팅을 열 수 없어요.
        <Link href="/my/business/store-orders" className="mt-4 block text-violet-700 underline">
          주문 목록
        </Link>
      </div>
    );
  }

  const orderChatsHref = "/my/store-orders";
  const flow: OrderChatFlow = order.order_type === "delivery" ? "delivery" : "pickup";

  return (
    <div className="flex min-h-screen flex-col bg-[#e8edf3]">
      <div className="sticky top-0 z-20 border-b border-sam-border bg-sam-surface shadow-sm">
        <div className="flex items-center gap-2 px-2 py-2">
          <AppBackButton backHref={detailHref} />
          <h1 className="min-w-0 flex-1 truncate text-center text-[15px] font-bold">주문 채팅</h1>
          <span className="w-10" />
        </div>
        <ChatHubTopTabs active="order" orderChatsHref={orderChatsHref} />
        <OrderChatProgressStrip orderStatus={order.order_status} orderFlow={flow} />
        <OrderChatHeader
          sticky={false}
          orderNo={order.order_no}
          subtitle={`${order.buyer_name} 고객님`}
          orderStatus={order.order_status}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <OrderChatMessageList messages={messages} perspective="owner" />
      </div>
      {toast ? <p className="bg-sam-ink py-1 text-center text-xs text-white">{toast}</p> : null}
      <OwnerChatInput
        disabled={chatBlocked}
        onSend={(t) => {
          const r = sendOrderChatTextFromOwner(order, ownerId, t);
          setToast(r.ok ? null : r.error);
          if (!r.ok) setTimeout(() => setToast(null), 2500);
        }}
      />
    </div>
  );
}
