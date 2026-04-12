"use client";

import { useState } from "react";
import { findSharedOrder } from "@/lib/shared-orders/shared-order-store";
import {
  sendOrderChatFromAdmin,
  setOrderChatMessagingBlocked,
  setOrderChatRoomStatus,
} from "@/lib/shared-order-chat/shared-chat-store";
import { notifyAdminInterventionRoom } from "@/lib/shared-order-chat/chat-notifications";
import { useDeliveryMockVersion } from "@/lib/admin/delivery-orders-mock/use-delivery-mock-store";
import { useOrderChatVersion } from "@/components/order-chat/use-order-chat-version";

export function AdminChatActionPanel({ orderId }: { orderId: string }) {
  const v = useDeliveryMockVersion();
  const cv = useOrderChatVersion();
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const order = findSharedOrder(orderId);
  void v;
  void cv;

  if (!order) return null;

  return (
    <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-app p-4 text-sm">
      <p className="font-bold text-sam-fg">관리자 개입</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-ui-rect bg-amber-600 px-3 py-1.5 text-xs font-bold text-white"
          onClick={() => {
            setOrderChatRoomStatus(orderId, "admin_review");
            notifyAdminInterventionRoom(order);
            setMsg("채팅방을 검토 모드로 전환했어요.");
          }}
        >
          admin_review 전환
        </button>
        <button
          type="button"
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-xs"
          onClick={() => {
            setOrderChatRoomStatus(orderId, "active");
            setMsg("채팅방을 활성으로 되돌렸어요.");
          }}
        >
          active 복구
        </button>
        <button
          type="button"
          className="rounded-ui-rect bg-red-700 px-3 py-1.5 text-xs font-bold text-white"
          onClick={() => {
            setOrderChatMessagingBlocked(order, true);
            setMsg("회원·매장 채팅 전송을 차단했어요.");
          }}
        >
          채팅 차단
        </button>
        <button
          type="button"
          className="rounded-ui-rect border border-red-300 bg-sam-surface px-3 py-1.5 text-xs text-red-800"
          onClick={() => {
            setOrderChatMessagingBlocked(order, false);
            setMsg("채팅 차단을 해제했어요.");
          }}
        >
          차단 해제
        </button>
      </div>
      <div>
        <label className="text-xs font-medium text-sam-muted">관리자 메시지</label>
        <div className="mt-1 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-sam-border px-2 py-1.5 text-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="분쟁 확인중입니다"
          />
          <button
            type="button"
            className="rounded-ui-rect bg-sam-ink px-3 py-1.5 text-xs font-bold text-white"
            onClick={() => {
              const r = sendOrderChatFromAdmin(order, text, false);
              setMsg(r.ok ? "전송했어요" : r.error);
              if (r.ok) setText("");
            }}
          >
            전송
          </button>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-sam-muted">시스템 메모 삽입 (admin_note)</label>
        <div className="mt-1 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-sam-border px-2 py-1.5 text-xs"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="관리자 확인 후 처리 예정입니다"
          />
          <button
            type="button"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-xs font-semibold"
            onClick={() => {
              const r = sendOrderChatFromAdmin(order, note, true);
              setMsg(r.ok ? "메모 삽입" : r.error);
              if (r.ok) setNote("");
            }}
          >
            삽입
          </button>
        </div>
      </div>
      {msg ? <p className="text-xs text-sam-muted">{msg}</p> : null}
    </div>
  );
}
