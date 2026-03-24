"use client";

import { useEffect, useRef } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { fetchOrderChatUnreadBreakdown } from "@/lib/chats/order-chat-unread-breakdown-fetch";
import { playOrderChatUnreadDebounced } from "@/lib/chats/order-chat-unread-sound";

const POLL_MS = 12_000;

/**
 * 로그인 시 매장 주문 채팅(`store_order`) 미읽음만 감시해, 증가 시 짧은 알림음 1회.
 * 거래 채팅 목록과 분리된 주문 채팅(`/orders?tab=chat`)용 소리 채널.
 */
export function GlobalOrderChatUnreadSound() {
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    const uid = user?.id;
    if (!uid) {
      prevRef.current = null;
      return;
    }

    let cancelled = false;

    const tick = async () => {
      try {
        const { orderTotal: o } = await fetchOrderChatUnreadBreakdown();
        if (cancelled) return;
        const prev = prevRef.current;
        if (prev !== null && o > prev) {
          playOrderChatUnreadDebounced(prev, o);
        }
        prevRef.current = o;
      } catch {
        /* ignore */
      }
    };

    void tick();
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void tick();
    }, POLL_MS);

    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return null;
}
