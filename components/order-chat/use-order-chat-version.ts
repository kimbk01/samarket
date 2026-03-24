"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  getOrderChatVersion,
  listMessagesForOrder,
  subscribeOrderChat,
} from "@/lib/shared-order-chat/shared-chat-store";

export function useOrderChatVersion(): number {
  return useSyncExternalStore(subscribeOrderChat, getOrderChatVersion, getOrderChatVersion);
}

/** 이 주문 스레드에 메시지가 바뀔 때만 바뀌는 값 — 읽음 처리 effect 의존성용(전역 cv와 분리). */
export function useOrderChatReadSignature(orderId: string): string {
  const cv = useOrderChatVersion();
  return useMemo(() => {
    void cv;
    const msgs = listMessagesForOrder(orderId);
    const last = msgs[msgs.length - 1];
    return last ? `${msgs.length}:${last.id}` : "0";
  }, [orderId, cv]);
}
