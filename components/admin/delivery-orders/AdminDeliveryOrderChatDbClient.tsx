"use client";

import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

type Props = { orderId: string };

export function AdminDeliveryOrderChatDbClient({ orderId }: Props) {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <AdminPageHeader
        title="주문 채팅"
        description="배달·매장 주문 채팅은 community_messenger 원장으로 통합되었습니다."
        backHref="/admin/order-chats"
      />
      <div className="flex flex-wrap gap-2 sam-text-body-secondary">
        <Link href={`/admin/store-orders?order_id=${encodeURIComponent(orderId)}`} className="text-signature underline">
          매장 주문(액션)에서 열기
        </Link>
        <span className="text-sam-muted">·</span>
        <Link href={`/admin/stores/orders/${encodeURIComponent(orderId)}`} className="text-sam-muted underline">
          배달 주문 상세(표)
        </Link>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm text-sam-muted">
        주문 `{orderId}`의 대화는 해당 참여자 메신저 방에서 확인합니다. 관리자 전용 레거시 조회/메모 API는 제거되었습니다.
      </div>
    </div>
  );
}
