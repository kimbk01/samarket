"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAdminOrderChatRoomsDeduped } from "@/lib/admin/fetch-admin-order-chat-rooms-deduped";
import type { OrderChatRoomPublic } from "@/lib/order-chat/types";
import type { SharedOrderStatus } from "@/lib/shared-orders/types";
import { UnreadBadge } from "@/components/order-chat/UnreadBadge";

function priorityRoom(r: OrderChatRoomPublic): number {
  let p = 0;
  if (r.room_status === "admin_review") p += 200;
  const s = r.last_chat_order_status as SharedOrderStatus | null;
  if (s === "refund_requested") p += 120;
  if (s === "cancel_requested") p += 100;
  if (s === "cancelled") p += 40;
  if (s === "refunded") p += 20;
  return p;
}

export function AdminOrderChatList() {
  const [rooms, setRooms] = useState<OrderChatRoomPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status, json: raw } = await fetchAdminOrderChatRoomsDeduped(120);
      const j = raw as { ok?: boolean; error?: string; rooms?: OrderChatRoomPublic[] };
      if (status < 200 || status >= 300 || j?.ok === false) {
        setRooms([]);
        setError(typeof j?.error === "string" ? j.error : `HTTP ${status}`);
        return;
      }
      setRooms(Array.isArray(j.rooms) ? j.rooms : []);
    } catch {
      setRooms([]);
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    return [...rooms].sort((a, b) => {
      const pa = priorityRoom(a);
      const pb = priorityRoom(b);
      if (pb !== pa) return pb - pa;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });
  }, [rooms]);

  if (loading) {
    return <p className="text-sm text-sam-muted">주문 채팅 방 불러오는 중…</p>;
  }

  if (error) {
    return (
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-950">
        목록을 불러오지 못했습니다 ({error}).
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-sam-muted">
        등록된 주문 채팅 방이 없습니다. 주문이 생기면 <code className="rounded bg-sam-app px-1 text-[11px]">order_chat_*</code> 에
        방이 만들어집니다.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-sam-muted">
          검토·환불·취소 관련 방이 위로 정렬됩니다 · 원장:{" "}
          <code className="rounded bg-sam-app px-1 text-[11px]">order_chat_rooms</code>
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-ui-rect border border-sam-border px-2 py-1 text-[11px] text-sam-fg hover:bg-sam-app"
        >
          새로고침
        </button>
      </div>
      {rows.map((r) => (
        <Link
          key={r.id}
          href={`/admin/delivery-orders/${encodeURIComponent(r.order_id)}/chat`}
          className="flex items-start justify-between gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm hover:border-signature"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-sam-muted">{r.order_no}</span>
              {r.room_status === "admin_review" ? (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">검토</span>
              ) : null}
            </div>
            <p className="text-sm font-semibold text-sam-fg">
              {r.store_name} · {r.buyer_name}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-sam-muted">{r.last_message}</p>
            {r.last_chat_order_status ? (
              <p className="mt-1 text-[11px] text-sam-muted">채팅 동기 주문상태 {r.last_chat_order_status}</p>
            ) : null}
          </div>
          <UnreadBadge count={r.unread_count_admin} />
        </Link>
      ))}
    </div>
  );
}
