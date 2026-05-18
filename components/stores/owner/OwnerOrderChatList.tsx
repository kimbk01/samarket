"use client";

import Link from "next/link";

export function OwnerOrderChatList({ slug, storeId }: { slug: string; storeId: string }) {
  return (
    <div className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted">
      <p>매장 주문 채팅은 메신저 배달 채팅함으로 통합되었습니다. ({slug || storeId})</p>
      <Link href="/community-messenger/delivery-chats" className="mt-3 inline-block font-medium text-signature underline">
        배달 채팅함 열기
      </Link>
    </div>
  );
}
