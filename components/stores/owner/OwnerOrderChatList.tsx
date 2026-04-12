"use client";

import Link from "next/link";
import { useMemo } from "react";
import { SHARED_SIM_STORE_ID } from "@/lib/shared-orders/types";
import { findSharedOrder } from "@/lib/shared-orders/shared-order-store";
import { listOrderChatRoomsForOwner } from "@/lib/shared-order-chat/shared-chat-store";
import { getMockSession } from "@/lib/mock-auth/mock-auth-store";
import { useMockAuthVersion } from "@/lib/mock-auth/use-mock-auth-version";
import { useOwnerOrdersVersion } from "@/lib/store-owner/use-owner-orders-store";
import { useOrderChatVersion } from "@/components/order-chat/use-order-chat-version";
import { UnreadBadge } from "@/components/order-chat/UnreadBadge";

export function OwnerOrderChatList({ slug, storeId }: { slug: string; storeId: string }) {
  const av = useMockAuthVersion();
  const cv = useOrderChatVersion();
  const ov = useOwnerOrdersVersion();
  const ownerId = useMemo(() => {
    void av;
    const s = getMockSession();
    return s.role === "owner" ? s.userId : null;
  }, [av]);

  const rows = useMemo(() => {
    void cv;
    void ov;
    if (!ownerId || storeId !== SHARED_SIM_STORE_ID) return [];
    return listOrderChatRoomsForOwner(ownerId, storeId);
  }, [cv, ov, ownerId, storeId]);

  if (storeId !== SHARED_SIM_STORE_ID) {
    return <p className="text-sm text-sam-muted">시뮬 매장만 주문 채팅 목록을 씁니다.</p>;
  }

  if (!ownerId) {
    return (
      <p className="rounded-ui-rect bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-200">
        매장(오너) 역할로 전환한 뒤 확인해 주세요.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted">주문 채팅이 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const order = findSharedOrder(r.order_id);
            const issue =
              order &&
              ["cancel_requested", "refund_requested", "refunded", "cancelled"].includes(order.order_status);
            return (
              <li key={r.id}>
                <Link
                  href={`/my/business/store-order-chat/${encodeURIComponent(r.order_id)}`}
                  className="flex items-start justify-between gap-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-sam-fg">{r.buyer_name}</p>
                      {issue ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                          확인
                        </span>
                      ) : null}
                    </div>
                    <p className="font-mono text-xs text-sam-meta">{r.order_no}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-sam-muted">{r.last_message}</p>
                  </div>
                  <UnreadBadge count={r.unread_count_owner} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
