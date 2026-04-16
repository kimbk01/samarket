"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrderChatRoomRealtime } from "@/lib/order-chat/use-order-chat-room-realtime";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { ChatHubTopTabs } from "@/components/order-chat/ChatHubTopTabs";
import { MemberChatInput } from "@/components/order-chat/MemberChatInput";
import { OrderChatHeader } from "@/components/order-chat/OrderChatHeader";
import { OrderChatMessageList } from "@/components/order-chat/OrderChatMessageList";
import { OrderChatProgressStrip } from "@/components/order-chat/OrderChatProgressStrip";
import { OwnerChatInput } from "@/components/order-chat/OwnerChatInput";
import type { SharedOrderStatus } from "@/lib/shared-orders/types";
import type { OrderChatFlow } from "@/lib/shared-order-chat/chat-message-builder";
import type {
  OrderChatMessagePublic,
  OrderChatRole,
  OrderChatRoomPublic,
  OrderChatSnapshot,
} from "@/lib/order-chat/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH } from "@/lib/chats/chat-channel-events";
import { createCommunityMessengerDeepLinkFromOrderChat } from "@/lib/community-messenger/order-chat-bridge";
import { fetchOrderChatGetDeduped } from "@/lib/order-chat/fetch-order-chat-get-deduped";

type Snapshot = {
  room: OrderChatRoomPublic;
  role: OrderChatRole;
  orderStatus: SharedOrderStatus;
  messages: OrderChatMessagePublic[];
  messagesCapped?: boolean;
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
  /** 전체 화면 주문 채팅에서만 기본 표시. 모달 등 좁은 UI에서는 false. */
  showMessengerDeepLink = true,
  /** RSC에서 `loadOrderChatSnapshotForPage` — 첫 GET 생략 */
  initialSnapshot = null,
}: {
  orderId: string;
  backHref: string;
  orderChatsHref?: string;
  showMessengerDeepLink?: boolean;
  initialSnapshot?: OrderChatSnapshot | null;
}) {
  const { t } = useI18n();
  const router = useRouter();

  const messengerBridgeErrorMessage = (code: string) => {
    if (code === "friend_required") return t("nav_messenger_order_bridge_friend_required");
    if (code === "blocked_target") return t("nav_messenger_order_bridge_blocked");
    return t("nav_messenger_order_bridge_failed");
  };

  const [messengerOpenBusy, setMessengerOpenBusy] = useState(false);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | ({ kind: "ready" } & Snapshot)
  >(() =>
    initialSnapshot
      ? {
          kind: "ready",
          room: initialSnapshot.room,
          role: initialSnapshot.role,
          orderStatus: initialSnapshot.orderStatus,
          messages: initialSnapshot.messages,
          messagesCapped: initialSnapshot.messagesCapped,
        }
      : { kind: "loading" }
  );
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const { status, json } = await fetchOrderChatGetDeduped(orderId);
      const payload = json as
        | ({ ok?: false; error?: string })
        | ({ ok?: true } & Snapshot);
      if (status < 200 || status >= 300 || payload.ok !== true) {
        const errorMessage =
          "error" in payload && typeof payload.error === "string" ? payload.error : "load_failed";
        setState({
          kind: "error",
          message: errorMessage,
        });
        return;
      }
      setState({ kind: "ready", ...payload });
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

  /** Realtime·타 탭 반영용 — 로딩 스피너 없이 스냅샷만 갱신 */
  const silentReload = useCallback(async () => {
    try {
      const { status, json } = await fetchOrderChatGetDeduped(orderId);
      const payload = json as
        | ({ ok?: false; error?: string })
        | ({ ok?: true } & Snapshot);
      if (status < 200 || status >= 300 || payload.ok !== true) return;
      setState((prev) => {
        if (prev.kind !== "ready") return prev;
        return { kind: "ready", ...payload };
      });
      window.dispatchEvent(new Event(KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH));
    } catch {
      /* ignore */
    }
  }, [orderId]);

  const onRealtimeMessageUpsert = useCallback((msg: OrderChatMessagePublic) => {
    setState((prev) => {
      if (prev.kind !== "ready") return prev;
      const exists = prev.messages.some((m) => m.id === msg.id);
      const nextMessages = exists ? prev.messages.map((m) => (m.id === msg.id ? msg : m)) : [...prev.messages, msg];
      const tail = nextMessages[nextMessages.length - 1];
      return {
        ...prev,
        messages: nextMessages,
        room: {
          ...prev.room,
          last_message: tail.content.slice(0, 200),
          last_message_at: tail.created_at,
        },
      };
    });
    window.dispatchEvent(new Event(KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH));
  }, []);

  const onRealtimeMessageRemoved = useCallback((id: string) => {
    setState((prev) =>
      prev.kind !== "ready" ? prev : { ...prev, messages: prev.messages.filter((m) => m.id !== id) }
    );
  }, []);

  useOrderChatRoomRealtime({
    roomId: state.kind === "ready" ? state.room.id : null,
    enabled: state.kind === "ready",
    onMessageUpsert: onRealtimeMessageUpsert,
    onMessageRemoved: onRealtimeMessageRemoved,
    onRoomStale: silentReload,
  });

  useEffect(() => {
    if (initialSnapshot) return;
    void load();
  }, [load, initialSnapshot]);

  /** RSC 스냅샷이 있을 때: 읽음 처리 + (메시지 cap 시) 전체 스냅샷 한 번 보강 */
  useEffect(() => {
    if (!initialSnapshot || !orderId.trim()) return;

    void fetch(`/api/order-chat/orders/${encodeURIComponent(orderId)}/read`, {
      method: "POST",
      credentials: "include",
    }).finally(() => {
      window.dispatchEvent(new Event(KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH));
    });

    if (!initialSnapshot.messagesCapped) return;

    let cancelled = false;
    void (async () => {
      try {
        const { status, json } = await fetchOrderChatGetDeduped(orderId);
        const payload = json as
          | ({ ok?: false; error?: string })
          | ({ ok?: true } & Omit<Snapshot, "messagesCapped">);
        if (cancelled || status < 200 || status >= 300 || payload.ok !== true) return;
        setState({
          kind: "ready",
          room: payload.room,
          role: payload.role,
          orderStatus: payload.orderStatus,
          messages: payload.messages,
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialSnapshot, orderId]);

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
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-sam-app px-4">
        <p className="text-sm text-muted">{t("member_order_chat_loading")}</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-sam-app px-4 text-center">
        <p className="text-sm text-sam-fg">
          {t("member_order_chat_open_failed")} ({state.message})
        </p>
        <Link href={backHref} className="text-sm font-medium text-signature underline">
          {t("member_order_chat_return_to_detail")}
        </Link>
        <Link href={orderChatsHref ?? "/my/store-orders"} className="text-sm text-sam-muted underline">
          {t("member_orders_chat_list")}
        </Link>
      </div>
    );
  }

  const subtitle =
    state.role === "buyer" ? state.room.store_name : `${state.room.buyer_name} 고객님`;
  const perspective = state.role === "buyer" ? "member" : "owner";

  return (
    <div className={`flex min-h-screen flex-col ${state.role === "buyer" ? "bg-[#e8e6ef]" : "bg-[#e8edf3]"}`}>
      <div className="sticky top-0 z-20 border-b border-sam-border bg-sam-surface shadow-sm">
        <div className="flex items-center gap-2 px-2 py-2">
          <AppBackButton backHref={backHref} />
          <h1 className="min-w-0 flex-1 truncate text-center text-[15px] font-bold">주문 채팅</h1>
          <span className="w-10" />
        </div>
        <ChatHubTopTabs active="order" orderChatsHref={orderChatsHref ?? "/my/store-orders"} />
        {state.role === "buyer" ? (
          <p className="border-t border-sam-border-soft bg-sam-app px-4 py-2 text-center text-[11px] leading-relaxed text-sam-muted">
            {t("member_order_chat_notice")}
          </p>
        ) : null}
        <OrderChatProgressStrip orderStatus={state.orderStatus} orderFlow={flow} />
        {showMessengerDeepLink ? (
          <div className="border-t border-sam-border-soft bg-sam-surface px-3 py-2">
            <button
              type="button"
              disabled={messengerOpenBusy}
              onClick={() => {
                if (state.kind !== "ready") return;
                setMessengerOpenBusy(true);
                void (async () => {
                  try {
                    const r = await createCommunityMessengerDeepLinkFromOrderChat({
                      role: state.role,
                      room: state.room,
                      orderStatus: state.orderStatus,
                    });
                    if (r.ok) {
                      router.push(r.href);
                    } else {
                      setToast(messengerBridgeErrorMessage(r.error));
                      setTimeout(() => setToast(null), 4200);
                    }
                  } finally {
                    setMessengerOpenBusy(false);
                  }
                })();
              }}
              className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 text-[13px] font-medium text-sam-fg disabled:opacity-50"
            >
              {messengerOpenBusy ? t("nav_messenger_order_bridge_busy") : t("nav_messenger_open_store_order")}
            </button>
          </div>
        ) : null}
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
      {toast ? <p className="bg-sam-ink px-3 py-2 text-center text-xs text-white">{toast}</p> : null}
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
