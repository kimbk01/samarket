"use client";

import Link from "next/link";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";

/** 사장 주문 채팅 레거시 진입점 — 메신저 delivery 방으로 서버 리다이렉트한다. */
export function OwnerOrderChatPageClient({
  storeId,
  orderId,
  slug: _slug,
}: {
  storeId: string;
  slug: string;
  orderId: string;
}) {
  const backHref = buildStoreOrdersHref({ storeId, orderId });
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-sam-app px-4 text-center">
      <p className="text-sm text-sam-muted">주문 채팅은 메신저에서 이어집니다.</p>
      <Link href={`/my/business/store-order-chat/${encodeURIComponent(orderId)}`} className="sam-btn sam-btn--primary sam-btn--md">
        메신저에서 열기
      </Link>
      <Link href={backHref} className="text-sm font-medium text-signature underline">
        주문 상세 보기
      </Link>
    </div>
  );
}
