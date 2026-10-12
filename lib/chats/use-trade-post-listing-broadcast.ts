"use client";

import type { MutableRefObject } from "react";
import { useEffect } from "react";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  TRADE_POST_LISTING_BROADCAST_EVENT,
  tradePostListingBroadcastChannelName,
  type TradePostListingBroadcastPayload,
} from "@/lib/trade/trade-post-listing-broadcast-channel";
import type { ChatMessage } from "@/lib/types/chat";
import type { TradeListingThreadNotice } from "@/lib/trade/trade-listing-thread-notice";

function parseTradePostListingBroadcastPayload(raw: unknown): TradePostListingBroadcastPayload | null {
  if (!raw || typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  const postId = typeof o.postId === "string" ? o.postId.trim() : "";
  if (!postId) return null;
  const sellerListingState = typeof o.sellerListingState === "string" ? o.sellerListingState : null;
  const postStatus = typeof o.postStatus === "string" ? o.postStatus : null;
  const at = typeof o.at === "string" ? o.at : new Date().toISOString();
  const tn = o.threadNotices;
  const threadNotices: TradeListingThreadNotice[] = [];
  if (Array.isArray(tn)) {
    for (const x of tn) {
      if (!x || typeof x !== "object") continue;
      const e = x as Record<string, unknown>;
      const ch = e.channel;
      const msg = e.message;
      if (ch !== "integrated" && ch !== "legacy_product_chat") continue;
      if (!msg || typeof msg !== "object") continue;
      const m = msg as Record<string, unknown>;
      if (typeof m.id !== "string" || typeof m.roomId !== "string") continue;
      threadNotices.push({ channel: ch, message: msg as ChatMessage });
    }
  }
  return {
    v: 1,
    postId,
    sellerListingState,
    postStatus,
    threadNotices,
    at,
  };
}

/**
 * `postId` 단위 Realtime Broadcast — 판매 단계·시스템 메시지 즉시 동기화(상대 기기 포함).
 */
export function useTradePostListingBroadcast(args: {
  postId: string | null;
  enabled: boolean;
  onPayloadRef: MutableRefObject<(p: TradePostListingBroadcastPayload) => void>;
}): void {
  useEffect(() => {
    const pid = args.postId?.trim() ?? "";
    if (!args.enabled || !pid) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    let cancelled = false;
    const sub = subscribeWithRetry({
      sb,
      name: tradePostListingBroadcastChannelName(pid),
      scope: `trade-post-listing:${pid}`,
      isCancelled: () => cancelled,
      silentAfterMs: 22_000,
      build: (ch) =>
        ch.on("broadcast", { event: TRADE_POST_LISTING_BROADCAST_EVENT }, (msg) => {
          try {
            const raw = (msg as { payload?: unknown }).payload;
            const parsed = parseTradePostListingBroadcastPayload(raw);
            if (!parsed) return;
            args.onPayloadRef.current(parsed);
          } catch {
            /* ignore */
          }
        }),
    });

    return () => {
      cancelled = true;
      sub.stop();
    };
  }, [args.postId, args.enabled, args.onPayloadRef]);
}
