"use client";

import Link from "next/link";

const BASE = "/my/store-orders";

export function MemberOrderChatList() {
  return (
    <div className="space-y-2">
      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-3 text-sm text-sam-muted shadow-sm ring-1 ring-sam-border-soft">
        주문 상태 확인과 취소·환불 요청은{" "}
        <Link href={BASE} className="font-medium text-signature underline">
          주문 내역
        </Link>
        에서 하고, 매장과의 대화만 여기서 이어가세요.
      </div>
      <div className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted ring-1 ring-sam-border-soft">
        <p>배달·매장 주문 채팅은 메신저 배달 채팅함으로 통합되었습니다.</p>
        <Link href="/community-messenger/delivery-chats" className="mt-3 inline-block font-medium text-signature underline">
          배달 채팅함 열기
        </Link>
      </div>
    </div>
  );
}
