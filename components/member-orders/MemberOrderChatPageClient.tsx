"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { ChatHubTopTabs } from "@/components/order-chat/ChatHubTopTabs";
import { MemberChatInput } from "@/components/order-chat/MemberChatInput";
import { OrderChatHeader } from "@/components/order-chat/OrderChatHeader";
import { OrderChatMessageList } from "@/components/order-chat/OrderChatMessageList";
import { OrderChatProgressStrip } from "@/components/order-chat/OrderChatProgressStrip";
import type { OrderChatFlow } from "@/lib/shared-order-chat/chat-message-builder";
import {
  useOrderChatReadSignature,
  useOrderChatVersion,
} from "@/components/order-chat/use-order-chat-version";
import { getDemoBuyerUserId } from "@/lib/member-orders/member-order-store";
import { findSharedOrder } from "@/lib/shared-orders/shared-order-store";
import {
  findOrderChatRoomByOrderId,
  listMessagesForOrder,
  markOrderChatReadAsMember,
  sendOrderChatTextFromMember,
} from "@/lib/shared-order-chat/shared-chat-store";
import { useMemberOrdersVersion } from "@/lib/member-orders/use-member-orders-store";
import { isStoreOrderChatDisabledForBuyer } from "@/lib/stores/order-status-transitions";

const BASE = "/my/store-orders";

export function MemberOrderChatPageClient({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  const cv = useOrderChatVersion();
  const readSig = useOrderChatReadSignature(orderId);
  const mv = useMemberOrdersVersion();
  const buyerId = getDemoBuyerUserId();
  const [toast, setToast] = useState<string | null>(null);

  const order = useMemo(() => {
    void mv;
    return findSharedOrder(orderId);
  }, [orderId, mv]);

  const messages = useMemo(() => {
    void cv;
    return listMessagesForOrder(orderId);
  }, [orderId, cv]);

  const chatBlocked = useMemo(() => {
    void cv;
    return findOrderChatRoomByOrderId(orderId)?.room_status === "blocked";
  }, [cv, orderId]);

  useEffect(() => {
    if (order && buyerId && order.buyer_user_id === buyerId) {
      markOrderChatReadAsMember(orderId, buyerId);
    }
  }, [buyerId, order, orderId, readSig]);

  if (!buyerId) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-16 text-center">
        <p className="text-sm text-gray-600">{t("member_order_chat_member_required")}</p>
        <Link href={BASE} className="mt-4 inline-block text-signature underline">
          {t("member_order_chat_list_link")}
        </Link>
      </div>
    );
  }

  if (!order || order.buyer_user_id !== buyerId) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-16 text-center">
        <p className="text-sm text-gray-600">{t("member_order_chat_open_failed")}</p>
        <Link href={BASE} className="mt-4 inline-block text-signature underline">
          {t("member_order_chat_list_link")}
        </Link>
      </div>
    );
  }

  if (isStoreOrderChatDisabledForBuyer(order.order_status)) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-16 text-center">
        <p className="text-sm text-gray-600">{t("member_order_chat_cancelled_blocked")}</p>
        <Link
          href={`${BASE}/${encodeURIComponent(orderId)}`}
          className="mt-4 inline-block text-signature underline"
        >
          {t("member_order_chat_to_detail")}
        </Link>
      </div>
    );
  }

  const flow: OrderChatFlow = order.order_type === "delivery" ? "delivery" : "pickup";

  return (
    <div className="flex min-h-screen flex-col bg-[#e8e6ef]">
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 px-2 py-2">
          <AppBackButton backHref={`${BASE}/${encodeURIComponent(orderId)}`} />
          <h1 className="min-w-0 flex-1 truncate text-center text-[15px] font-bold">{t("member_order_chat_title")}</h1>
          <span className="w-10" />
        </div>
        <ChatHubTopTabs active="order" />
        <p className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-center text-[11px] leading-relaxed text-gray-600">
          {t("member_order_chat_notice")}
        </p>
        <OrderChatProgressStrip orderStatus={order.order_status} orderFlow={flow} />
        <OrderChatHeader
          sticky={false}
          orderNo={order.order_no}
          subtitle={order.store_name}
          orderStatus={order.order_status}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <OrderChatMessageList messages={messages} perspective="member" />
      </div>
      {toast ? (
        <p className="bg-gray-900 px-3 py-2 text-center text-xs text-white">{toast}</p>
      ) : null}
      <div className="mt-auto">
        <button
          type="button"
          className="w-full border-t border-amber-200 bg-amber-50 py-2 text-center text-[11px] font-medium text-amber-900"
          onClick={() => alert("샘플: 신고·분쟁은 고객센터/관리자 연동 예정입니다.")}
        >
          {t("member_order_issue_report_sample")}
        </button>
        <MemberChatInput
          disabled={chatBlocked}
          onSend={(t) => {
            const r = sendOrderChatTextFromMember(order, buyerId, t);
            setToast(r.ok ? null : r.error);
            if (!r.ok) setTimeout(() => setToast(null), 2500);
          }}
        />
      </div>
    </div>
  );
}
