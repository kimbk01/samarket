"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { UnreadBadge } from "@/components/order-chat/UnreadBadge";
import { fetchMeOrderChatRoomsDeduped } from "@/lib/me/fetch-me-order-chat-rooms-deduped";
import type { OrderChatRoomPublic } from "@/lib/order-chat/types";

export function OwnerOrderChatList({ slug, storeId }: { slug: string; storeId: string }) {
  const [rooms, setRooms] = useState<OrderChatRoomPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading((prev) => (prev ? prev : true));
    setError((prev) => (prev === null ? prev : null));
    try {
      const { status, json: raw } = await fetchMeOrderChatRoomsDeduped(storeId);
      const j = raw as { ok?: boolean; error?: string; rooms?: OrderChatRoomPublic[] };
      if (status === 403) {
        setRooms([]);
        setError("forbidden");
        return;
      }
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
      setLoading((prev) => (prev ? false : prev));
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-sam-muted">주문 채팅을 불러오는 중…</p>;
  }

  if (error === "forbidden") {
    return (
      <p className="text-sm text-sam-muted">
        이 매장 주문 채팅을 보려면 해당 매장 소유자 계정으로 로그인해 주세요. ({slug})
      </p>
    );
  }

  if (error) {
    return (
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        목록을 불러오지 못했습니다 ({error}).
        <button type="button" className="ml-2 font-medium text-signature underline" onClick={() => void load()}>
          다시 시도
        </button>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rooms.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted">주문 채팅이 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {rooms.map((r) => {
            const issue =
              r.last_chat_order_status &&
              ["cancel_requested", "refund_requested", "refunded", "cancelled"].includes(r.last_chat_order_status);
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
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 sam-text-xxs font-bold text-amber-900">
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
