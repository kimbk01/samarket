"use client";

import { useMemo, useSyncExternalStore } from "react";
import { KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH } from "@/lib/chats/chat-channel-events";

let version = 0;
const listeners = new Set<() => void>();

function bump() {
  version += 1;
  for (const l of listeners) l();
}

function subscribeOrderChatHub(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => bump();
  window.addEventListener(KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH, handler);
  listeners.add(cb);
  return () => {
    window.removeEventListener(KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH, handler);
    listeners.delete(cb);
  };
}

function getOrderChatHubVersion() {
  return version;
}

/**
 * 주문 채팅 관련 화면이 `order_chat_*` API를 갱신한 뒤
 * `KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH` 로 목록·배지를 맞출 때 버전이 올라갑니다.
 * (레거시 인메모리 `shared-chat-store` 구독 제거)
 */
export function useOrderChatVersion(): number {
  return useSyncExternalStore(subscribeOrderChatHub, getOrderChatHubVersion, getOrderChatHubVersion);
}

/** 읽음 처리 effect 의존성 — 허브 갱신 틱마다 바뀜 */
export function useOrderChatReadSignature(orderId: string): string {
  const cv = useOrderChatVersion();
  return useMemo(() => `${orderId}:${cv}`, [orderId, cv]);
}
