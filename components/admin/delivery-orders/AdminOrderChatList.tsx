"use client";

import Link from "next/link";
import { useMemo } from "react";
import { findSharedOrder } from "@/lib/shared-orders/shared-order-store";
import { listOrderChatRooms } from "@/lib/shared-order-chat/shared-chat-store";
import { useDeliveryMockVersion } from "@/lib/admin/delivery-orders-mock/use-delivery-mock-store";
import { useOrderChatVersion } from "@/components/order-chat/use-order-chat-version";
import { UnreadBadge } from "@/components/order-chat/UnreadBadge";

function priority(room: ReturnType<typeof listOrderChatRooms>[0], order: ReturnType<typeof findSharedOrder>) {
  let p = 0;
  if (room.room_status === "admin_review") p += 200;
  if (order?.order_status === "refund_requested") p += 120;
  if (order?.order_status === "cancel_requested") p += 100;
  if (order?.has_report || order?.dispute_memo) p += 80;
  if (order?.order_status === "cancelled") p += 40;
  return p;
}

export function AdminOrderChatList() {
  const dv = useDeliveryMockVersion();
  const cv = useOrderChatVersion();

  const rows = useMemo(() => {
    void dv;
    void cv;
    const list = listOrderChatRooms();
    return [...list].sort((a, b) => {
      const oa = findSharedOrder(a.order_id);
      const ob = findSharedOrder(b.order_id);
      const pa = priority(a, oa);
      const pb = priority(b, ob);
      if (pb !== pa) return pb - pa;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });
  }, [cv, dv]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-600">
        신고·환불·취소 요청·admin_review 방이 위로 정렬됩니다.
      </p>
      {rows.map((r) => {
        const o = findSharedOrder(r.order_id);
        return (
          <Link
            key={r.id}
            href={`/admin/delivery-orders/${encodeURIComponent(r.order_id)}/chat`}
            className="flex items-start justify-between gap-3 rounded-ui-rect border border-gray-200 bg-white p-4 shadow-sm hover:border-signature"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-gray-500">{r.order_no}</span>
                {r.room_status === "admin_review" ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                    검토
                  </span>
                ) : null}
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {r.store_name} · {r.buyer_name}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-gray-600">{r.last_message}</p>
              {o ? <p className="mt-1 text-[11px] text-gray-500">주문상태 {o.order_status}</p> : null}
            </div>
            <UnreadBadge count={r.unread_count_admin} />
          </Link>
        );
      })}
    </div>
  );
}
