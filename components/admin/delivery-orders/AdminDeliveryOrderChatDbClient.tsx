"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ChatHubTopTabs } from "@/components/order-chat/ChatHubTopTabs";
import { OrderChatHeader } from "@/components/order-chat/OrderChatHeader";
import { OrderChatMessageList } from "@/components/order-chat/OrderChatMessageList";
import { OrderChatProgressStrip } from "@/components/order-chat/OrderChatProgressStrip";
import type { OrderChatMessagePublic } from "@/lib/order-chat/types";
import { mapOrderChatMessagePublicToUi } from "@/lib/order-chat/map-order-chat-message-ui";
import type { SharedOrderStatus } from "@/lib/shared-orders/types";
import type { OrderChatFlow } from "@/lib/shared-order-chat/chat-message-builder";

type Props = { orderId: string };

export function AdminDeliveryOrderChatDbClient({ orderId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<SharedOrderStatus | null>(null);
  const [orderNo, setOrderNo] = useState("");
  const [storeName, setStoreName] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [orderFlow, setOrderFlow] = useState<OrderChatFlow>("pickup");
  const [messages, setMessages] = useState<OrderChatMessagePublic[]>([]);
  const [note, setNote] = useState("");
  const [sendBusy, setSendBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/order-chat/orders/${encodeURIComponent(orderId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        room?: { order_no?: string; store_name?: string; buyer_name?: string; order_flow?: OrderChatFlow };
        orderStatus?: SharedOrderStatus;
        messages?: OrderChatMessagePublic[];
      };
      if (!res.ok || !json.ok) {
        setError(typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
        setOrderStatus(null);
        setMessages([]);
        return;
      }
      setOrderNo(String(json.room?.order_no ?? ""));
      setStoreName(String(json.room?.store_name ?? ""));
      setBuyerName(String(json.room?.buyer_name ?? ""));
      setOrderFlow(json.room?.order_flow === "delivery" ? "delivery" : "pickup");
      setOrderStatus(json.orderStatus ?? "pending");
      setMessages(Array.isArray(json.messages) ? json.messages : []);
    } catch {
      setError("network_error");
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const uiMessages = useMemo(() => messages.map(mapOrderChatMessagePublicToUi), [messages]);

  const sendNote = async () => {
    const text = note.trim();
    if (!text || sendBusy) return;
    setSendBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/order-chat/orders/${encodeURIComponent(orderId)}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
        return;
      }
      setNote("");
      await load();
    } catch {
      setError("network_error");
    } finally {
      setSendBusy(false);
    }
  };

  if (loading && !orderStatus && messages.length === 0) {
    return (
      <div className="p-6">
        <AdminPageHeader title="주문 채팅" backHref="/admin/order-chats" />
        <p className="text-sm text-sam-muted">불러오는 중…</p>
      </div>
    );
  }

  if (error && !orderStatus) {
    return (
      <div className="p-6">
        <AdminPageHeader title="주문 채팅" backHref="/admin/order-chats" />
        <p className="rounded-ui-rect bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        <p className="mt-2 text-[13px] text-sam-muted">
          주문 UUID가 맞는지, <Link href="/admin/store-orders">매장 주문(액션)</Link>에서 확인하세요.
        </p>
      </div>
    );
  }

  const os = orderStatus ?? "pending";

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AdminPageHeader
        title="주문 채팅 (실데이터)"
        description="order_chat_* · 관리자 메모는 구매자·사장 미읽음에 반영됩니다."
        backHref="/admin/order-chats"
      />
      <div className="flex flex-wrap gap-2 text-[13px]">
        <Link href={`/admin/store-orders?order_id=${encodeURIComponent(orderId)}`} className="text-signature underline">
          매장 주문(액션)에서 열기
        </Link>
        <span className="text-sam-muted">·</span>
        <Link href={`/admin/delivery-orders/${encodeURIComponent(orderId)}`} className="text-sam-muted underline">
          배달 주문 상세(표)
        </Link>
      </div>
      <ChatHubTopTabs active="order" orderChatsHref="/admin/order-chats" />
      <div className="mx-auto max-w-lg overflow-hidden rounded-ui-rect border border-sam-border bg-[#eceef2] shadow-sm">
        <OrderChatProgressStrip orderStatus={os} orderFlow={orderFlow} />
        <OrderChatHeader
          sticky={false}
          orderNo={orderNo || orderId}
          subtitle={`${storeName || "매장"} · ${buyerName || "구매자"}`}
          orderStatus={os}
        />
        <div className="max-h-[55vh] overflow-y-auto">
          <OrderChatMessageList messages={uiMessages} perspective="admin" />
        </div>
        <div className="border-t border-sam-border bg-sam-surface p-3">
          <p className="text-xs font-medium text-sam-muted">관리자 메모 (admin_note)</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="고객·매장에 전달할 운영 메모…"
              className="min-h-[44px] flex-1 rounded-ui-rect border border-sam-border bg-white px-2 py-1.5 text-sm text-sam-fg"
            />
            <button
              type="button"
              disabled={sendBusy || !note.trim()}
              onClick={() => void sendNote()}
              className="rounded-ui-rect bg-sam-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {sendBusy ? "전송 중…" : "보내기"}
            </button>
          </div>
          {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
