"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { UnreadBadge } from "@/components/order-chat/UnreadBadge";
import { fetchMeOrderChatRoomsDeduped } from "@/lib/me/fetch-me-order-chat-rooms-deduped";
import type { OrderChatRoomPublic } from "@/lib/order-chat/types";

const BASE = "/my/store-orders";

export function MemberOrderChatList() {
  const [rooms, setRooms] = useState<OrderChatRoomPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status, json: raw } = await fetchMeOrderChatRoomsDeduped(null);
      const j = raw as { ok?: boolean; error?: string; rooms?: OrderChatRoomPublic[] };
      if (status === 401) {
        setRooms([]);
        setError("unauthorized");
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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-sam-muted">주문 채팅을 불러오는 중…</p>;
  }

  if (error === "unauthorized") {
    return (
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        로그인 후 내 주문 채팅 목록을 확인할 수 있어요.
      </p>
    );
  }

  if (error) {
    return (
      <p className="rounded-ui-rect border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        목록을 불러오지 못했습니다 ({error}).
        <button type="button" className="ml-2 font-medium text-signature underline" onClick={() => void load()}>
          다시 시도
        </button>
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
      {rooms.length === 0 ? (
        <div className="rounded-ui-rect bg-sam-surface p-6 text-sm text-sam-muted ring-1 ring-sam-border-soft">
          <p>주문 채팅이 없어요.</p>
          <Link href={BASE} className="mt-3 inline-block font-medium text-signature underline">
            주문 내역 보기
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {rooms.map((r) => {
            const chatHref = `${BASE}/${encodeURIComponent(r.order_id)}/chat`;
            const detailHref = `${BASE}/${encodeURIComponent(r.order_id)}`;
            const issue =
              r.last_chat_order_status &&
              ["cancel_requested", "refund_requested", "refunded", "cancelled"].includes(r.last_chat_order_status);
            return (
              <li key={r.id}>
                <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm ring-1 ring-sam-border-soft">
                  <Link href={chatHref} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-sam-fg">{r.store_name}</p>
                        {issue ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 sam-text-xxs font-bold text-amber-900">
                            확인
                          </span>
                        ) : null}
                      </div>
                      <p className="font-mono text-xs text-sam-meta">{r.order_no}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-sam-muted">{r.last_message}</p>
                      {r.last_chat_order_status ? (
                        <p className="mt-1 sam-text-xxs text-signature">상태 · {r.last_chat_order_status}</p>
                      ) : null}
                    </div>
                    <UnreadBadge count={r.unread_count_buyer} />
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
