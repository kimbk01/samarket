"use client";

import Link from "next/link";

export function AdminOrderChatList() {
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm text-sam-muted">
      <p>주문 채팅 목록은 메신저 배달 채팅함으로 통합되었습니다.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link href="/community-messenger/delivery-chats" className="font-medium text-signature underline">
          배달 채팅함 열기
        </Link>
        <Link href="/admin/store-orders" className="font-medium text-sam-fg underline">
          매장 주문 관리
        </Link>
      </div>
    </div>
  );
}
