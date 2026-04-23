"use client";

import type { TradeListingThreadNotice } from "@/lib/trade/trade-listing-thread-notice";

const BROADCAST_NAME = "samarket:trade-listing-thread-notices:v1";

type ThreadNoticesPayload = { postId: string; notices: TradeListingThreadNotice[] };

/**
 * 판매 단계 저장 API가 돌려준 시스템 메시지를 **같은 기기의 다른 탭·창**까지 즉시 반영한다.
 * (Supabase `chat_messages` Realtime 누락·지연과 무관하게 동작)
 */
export function dispatchTradeListingThreadNotices(args: ThreadNoticesPayload): void {
  if (typeof window === "undefined") return;
  try {
    const bc = new BroadcastChannel(BROADCAST_NAME);
    bc.postMessage(args);
    bc.close();
  } catch {
    /* ignore */
  }
}

export function subscribeTradeListingThreadNotices(listener: (detail: ThreadNoticesPayload) => void): () => void {
  if (typeof window === "undefined") return () => {};

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(BROADCAST_NAME);
    bc.onmessage = (ev: MessageEvent<ThreadNoticesPayload>) => {
      const m = ev.data;
      if (!m?.postId || !Array.isArray(m.notices)) return;
      listener({ postId: m.postId, notices: m.notices });
    };
  } catch {
    /* ignore */
  }

  return () => {
    try {
      bc?.close();
    } catch {
      /* ignore */
    }
  };
}
