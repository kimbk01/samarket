"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminChatActionPanel } from "@/components/admin/delivery-orders/AdminChatActionPanel";
import { ChatHubTopTabs } from "@/components/order-chat/ChatHubTopTabs";
import { OrderChatHeader } from "@/components/order-chat/OrderChatHeader";
import { OrderChatProgressStrip } from "@/components/order-chat/OrderChatProgressStrip";
import type { OrderChatFlow } from "@/lib/shared-order-chat/chat-message-builder";
import { OrderChatMessageList } from "@/components/order-chat/OrderChatMessageList";
import {
  useOrderChatReadSignature,
  useOrderChatVersion,
} from "@/components/order-chat/use-order-chat-version";
import { useDeliveryMockVersion } from "@/lib/admin/delivery-orders-mock/use-delivery-mock-store";
import { findSharedOrder } from "@/lib/shared-orders/shared-order-store";
import {
  listMessagesForOrder,
  markOrderChatReadAsAdmin,
  sendOrderChatFromAdmin,
} from "@/lib/shared-order-chat/shared-chat-store";

export function AdminOrderChatPageClient({ orderId }: { orderId: string }) {
  const dv = useDeliveryMockVersion();
  const cv = useOrderChatVersion();
  const readSig = useOrderChatReadSignature(orderId);
  const [adminLine, setAdminLine] = useState("");

  const order = useMemo(() => {
    void dv;
    return findSharedOrder(orderId);
  }, [dv, orderId]);

  const messages = useMemo(() => {
    void cv;
    return listMessagesForOrder(orderId);
  }, [cv, orderId]);

  useEffect(() => {
    markOrderChatReadAsAdmin(orderId);
  }, [orderId, readSig]);

  if (!order) {
    return (
      <div className="p-6">
        <AdminPageHeader title="주문 채팅" backHref="/admin/order-chats" />
        <p className="text-sm text-gray-600">주문을 찾을 수 없습니다.</p>
      </div>
    );
  }

  const flow: OrderChatFlow = order.order_type === "delivery" ? "delivery" : "pickup";

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AdminPageHeader title={`채팅 · ${order.order_no}`} backHref={`/admin/delivery-orders/${orderId}`} />
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={`/admin/delivery-orders/${orderId}`} className="text-signature underline">
          주문 상세로
        </Link>
        <Link href="/admin/order-chats" className="text-gray-600 underline">
          채팅 목록
        </Link>
      </div>
      <ChatHubTopTabs active="order" orderChatsHref="/admin/order-chats" />
      <div className="mx-auto max-w-lg overflow-hidden rounded-ui-rect border border-gray-200 bg-[#eceef2] shadow-sm">
        <OrderChatProgressStrip orderStatus={order.order_status} orderFlow={flow} />
        <OrderChatHeader
          sticky={false}
          orderNo={order.order_no}
          subtitle={`${order.store_name} · ${order.buyer_name}`}
          orderStatus={order.order_status}
        />
        <div className="max-h-[50vh] overflow-y-auto">
          <OrderChatMessageList messages={messages} perspective="admin" />
        </div>
        <div className="border-t border-gray-200 bg-white p-3">
          <p className="text-xs font-medium text-gray-600">관리자 빠른 입력</p>
          <div className="mt-2 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={adminLine}
              onChange={(e) => setAdminLine(e.target.value)}
              placeholder="분쟁 확인중입니다"
            />
            <button
              type="button"
              className="rounded-ui-rect bg-gray-900 px-3 py-1.5 text-xs font-bold text-white"
              onClick={() => {
                if (!adminLine.trim()) return;
                sendOrderChatFromAdmin(order, adminLine.trim(), false);
                setAdminLine("");
              }}
            >
              전송
            </button>
          </div>
        </div>
      </div>
      <AdminChatActionPanel orderId={orderId} />
    </div>
  );
}
