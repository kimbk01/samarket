"use client";

import Link from "next/link";

const BASE = "/my/store-orders";

/** 구매자 주문 채팅 레거시 진입점 — 메신저 delivery 방으로 서버 리다이렉트한다. */
export function MemberOrderChatPageClient({ orderId }: { orderId: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-sam-app px-4 text-center">
      <p className="text-sm text-sam-muted">주문 채팅은 메신저에서 이어집니다.</p>
      <Link href={`${BASE}/${encodeURIComponent(orderId)}/chat`} className="sam-btn sam-btn--primary sam-btn--md">
        메신저에서 열기
      </Link>
    </div>
  );
}
