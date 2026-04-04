"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { ChatHubTopTabs } from "@/components/order-chat/ChatHubTopTabs";
import { MemberChatInput } from "@/components/order-chat/MemberChatInput";
import { OrderChatHeader } from "@/components/order-chat/OrderChatHeader";
import { OrderChatMessageList } from "@/components/order-chat/OrderChatMessageList";
import { OrderChatProgressStrip } from "@/components/order-chat/OrderChatProgressStrip";
import { OwnerChatInput } from "@/components/order-chat/OwnerChatInput";
import type { SharedOrderStatus } from "@/lib/shared-orders/types";
import type { OrderChatFlow } from "@/lib/shared-order-chat/chat-message-builder";
import type { OrderChatMessagePublic, OrderChatRole, OrderChatRoomPublic } from "@/lib/order-chat/types";
import { KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH } from "@/lib/chats/chat-channel-events";

type Snapshot = {
  room: OrderChatRoomPublic;
  role: OrderChatRole;
  orderStatus: SharedOrderStatus;
  messages: OrderChatMessagePublic[];
};

function mapMessageForUi(message: OrderChatMessagePublic) {
  return {
    ...message,
    sender_type:
      message.sender_type === "buyer"
        ? "member"
        : message.sender_type === "owner"
          ? "owner"
          : message.sender_type,
  };
}

export function OrderChatRoomClient({
  orderId,
  backHref,
  orderChatsHref,
}: {
  orderId: string;
  backHref: string;
  orderChatsHref?: string;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | ({ kind: "ready" } & Snapshot)
  >({ kind: "loading" });
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/order-chat/orders/${encodeURIComponent(orderId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as
        | ({ ok?: false; error?: string })
        | ({ ok?: true } & Snapshot);
      if (!res.ok || json.ok !== true) {
        const errorMessage =
          "error" in json && typeof json.error === "string" ? json.error : "load_failed";
        setState({
          kind: "error",
          message: errorMessage,
        });
        return;
      }
      setState({ kind: "ready", ...json });
      void fetch(`/api/order-chat/orders/${encodeURIComponent(orderId)}/read`, {
        method: "POST",
        credentials: "include",
      }).finally(() => {
        window.dispatchEvent(new Event(KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH));
      });
    } catch {
      setState({ kind: "error", message: "network_error" });
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const flow = useMemo<OrderChatFlow>(() => {
    if (state.kind !== "ready") return "pickup";
    return state.room.order_flow === "delivery" ? "delivery" : "pickup";
  }, [state]);

  const messages = useMemo(
    () => (state.kind === "ready" ? state.messages.map(mapMessageForUi) : []),
    [state]
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (state.kind !== "ready") return;
      try {
        const res = await fetch(`/api/order-chat/orders/${encodeURIComponent(orderId)}/messages`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: OrderChatMessagePublic;
        };
        if (!res.ok || json.ok !== true || !json.message) {
          setToast(json.error ?? "send_failed");
          setTimeout(() => setToast(null), 2500);
          return;
        }
        const sentMessage = json.message;
        setState((prev) =>
          prev.kind !== "ready"
            ? prev
            : {
                ...prev,
                messages: [...prev.messages, sentMessage],
                room: {
                  ...prev.room,
                  last_message: sentMessage.content.slice(0, 200),
                  last_message_at: sentMessage.created_at,
                },
              }
        );
        window.dispatchEvent(new Event(KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH));
      } catch {
        setToast("network_error");
        setTimeout(() => setToast(null), 2500);
      }
    },
    [orderId, state]
  );

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-gray-50 px-4">
        <p className="text-sm text-[#8E8E8E]">주문 채팅을 불러오는 중…</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 px-4 text-center">
        <p className="text-sm text-gray-700">채팅을 열 수 없습니다. ({state.message})</p>
        <Link href={backHref} className="text-sm font-medium text-signature underline">
          주문 상세로 돌아가기
        </Link>
        <Link href={orderChatsHref ?? "/my/store-orders"} className="text-sm text-gray-600 underline">
          주문 채팅 목록
        </Link>
      </div>
    );
  }

  const subtitle =
    state.role === "buyer" ? state.room.store_name : `${state.room.buyer_name} 고객님`;
  const perspective = state.role === "buyer" ? "member" : "owner";

  return (
    <div className={`flex min-h-screen flex-col ${state.role === "buyer" ? "bg-[#e8e6ef]" : "bg-[#e8edf3]"}`}>
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 px-2 py-2">
          <AppBackButton backHref={backHref} />
          <h1 className="min-w-0 flex-1 truncate text-center text-[15px] font-bold">주문 채팅</h1>
          <span className="w-10" />
        </div>
        <ChatHubTopTabs active="order" orderChatsHref={orderChatsHref ?? "/my/store-orders"} />
        {state.role === "buyer" ? (
          <p className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-center text-[11px] leading-relaxed text-gray-600">
            주문 상태 확인, 취소, 환불 요청은 주문 상세에서 진행하고 매장과의 대화만 여기서 이어가세요.
          </p>
        ) : null}
        <OrderChatProgressStrip orderStatus={state.orderStatus} orderFlow={flow} />
        <OrderChatHeader
          sticky={false}
          orderNo={state.room.order_no}
          subtitle={subtitle}
          orderStatus={state.orderStatus}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <OrderChatMessageList messages={messages as any} perspective={perspective as any} />
      </div>
      {toast ? <p className="bg-gray-900 px-3 py-2 text-center text-xs text-white">{toast}</p> : null}
      {state.role === "buyer" ? (
        <div className="mt-auto">
          <MemberChatInput disabled={state.room.room_status === "blocked"} onSend={handleSend} />
        </div>
      ) : (
        <OwnerChatInput disabled={state.room.room_status === "blocked"} onSend={handleSend} />
      )}
    </div>
  );
}
