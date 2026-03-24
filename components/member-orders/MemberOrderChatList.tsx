"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getDemoBuyerUserId } from "@/lib/member-orders/member-order-store";
import { findSharedOrder } from "@/lib/shared-orders/shared-order-store";
import { listOrderChatRoomsForBuyer } from "@/lib/shared-order-chat/shared-chat-store";
import { useMemberOrdersVersion } from "@/lib/member-orders/use-member-orders-store";
import { useOrderChatVersion } from "@/components/order-chat/use-order-chat-version";
import { UnreadBadge } from "@/components/order-chat/UnreadBadge";

const BASE = "/mypage/store-orders";

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
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        회원 역할에서만 내 주문 채팅 목록이 보여요.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-sm text-gray-500 ring-1 ring-gray-100">주문 채팅이 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const order = findSharedOrder(r.order_id);
            const chatHref = order
              ? `${BASE}/${encodeURIComponent(r.order_id)}/chat`
              : `/my/store-orders/${encodeURIComponent(r.order_id)}/chat`;
            return (
              <li key={r.id}>
                <Link
                  href={chatHref}
                  className="flex items-start justify-between gap-2 rounded-xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-gray-50"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900">{r.store_name}</p>
                    <p className="font-mono text-xs text-gray-400">{r.order_no}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-gray-600">{r.last_message}</p>
                    {order ? (
                      <p className="mt-1 text-[11px] text-violet-700">상태 · {order.order_status}</p>
                    ) : null}
                  </div>
                  <UnreadBadge count={r.unread_count_member} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
