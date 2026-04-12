"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getDemoBuyerUserId } from "@/lib/member-orders/member-order-store";
import { findSharedOrder } from "@/lib/shared-orders/shared-order-store";
import { listOrderChatRoomsForBuyer } from "@/lib/shared-order-chat/shared-chat-store";
import { useMemberOrdersVersion } from "@/lib/member-orders/use-member-orders-store";
import { useOrderChatVersion } from "@/components/order-chat/use-order-chat-version";
import { UnreadBadge } from "@/components/order-chat/UnreadBadge";

const BASE = "/my/store-orders";

export function MemberOrderChatList() {
  const cv = useOrderChatVersion();
  const ov = useMemberOrdersVersion();
  const buyerId = getDemoBuyerUserId();

  const rows = useMemo(() => {
    void cv;
    void ov;
    return listOrderChatRoomsForBuyer(buyerId);
  }, [buyerId, cv, ov]);

  if (!buyerId) {
    return (
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        회원 역할에서만 내 주문 채팅 목록이 보여요.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-3 text-sm text-sam-muted shadow-sm ring-1 ring-sam-border-soft">
        주문 상태 확인과 취소·환불 요청은{" "}
        <Link href={BASE} className="font-medium text-signature underline">
          주문 내역
        </Link>
        에서 하고, 매장과의 대화만 여기서 이어가세요.
      </div>
      {rows.length === 0 ? (
        <div className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted ring-1 ring-sam-border-soft">
          <p>주문 채팅이 없어요.</p>
          <Link href={BASE} className="mt-3 inline-block font-medium text-signature underline">
            주문 내역 보기
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const order = findSharedOrder(r.order_id);
            const chatHref = order
              ? `${BASE}/${encodeURIComponent(r.order_id)}/chat`
              : `/my/store-orders/${encodeURIComponent(r.order_id)}/chat`;
            const detailHref = order
              ? `${BASE}/${encodeURIComponent(r.order_id)}`
              : `/my/store-orders/${encodeURIComponent(r.order_id)}`;
            return (
              <li key={r.id}>
                <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm ring-1 ring-sam-border-soft">
                  <Link href={chatHref} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-sam-fg">{r.store_name}</p>
                      <p className="font-mono text-xs text-sam-meta">{r.order_no}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-sam-muted">{r.last_message}</p>
                      {order ? (
                        <p className="mt-1 text-[11px] text-signature">상태 · {order.order_status}</p>
                      ) : null}
                    </div>
                    <UnreadBadge count={r.unread_count_member} />
                  </Link>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs">
                    <Link href={detailHref} className="font-medium text-sam-fg underline">
                      주문 상세
                    </Link>
                    <Link href={chatHref} className="font-medium text-signature underline">
                      채팅 열기
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
