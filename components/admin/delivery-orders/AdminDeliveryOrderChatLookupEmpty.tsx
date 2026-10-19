"use client";

import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTechDetails } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = { orderId: string };

/** Empty lookup-only state when the order has no linked messenger room (admin never creates rooms). */
export function AdminDeliveryOrderChatLookupEmpty({ orderId }: Props) {
  const { language } = useI18n();
  const ko = language !== "en";
  return (
    <div
      className="space-y-4 p-4 md:p-6"
      data-admin-surface="live"
      data-admin-domain="delivery"
      data-testid="admin-order-chat-lookup-empty"
    >
      <AdminPageHeader
        title={ko ? "주문 채팅" : "Order chat"}
        description={ko ? "주문에 연결된 채팅을 조회합니다." : "Look up the chat linked to this order."}
        backHref="/admin/order-chats"
      />
      <div className="flex flex-wrap gap-2 sam-text-body-secondary">
        <Link href={`/admin/stores/orders/${encodeURIComponent(orderId)}`} className="text-signature underline">
          {ko ? "주문 상세 보기" : "Open order detail"}
        </Link>
        <span className="text-sam-muted">·</span>
        <Link href="/admin/store-orders" className="text-sam-muted underline">
          {ko ? "처리 필요 주문" : "Orders needing action"}
        </Link>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm text-sam-muted">
        {ko
          ? "이 주문에 연결된 채팅방이 없습니다. 관리자 화면에서는 채팅방을 새로 만들지 않습니다."
          : "No chat room is linked to this order. Admin screens never create chat rooms."}
        <AdminTechDetails ko={ko}>orderId={orderId}</AdminTechDetails>
      </div>
    </div>
  );
}
