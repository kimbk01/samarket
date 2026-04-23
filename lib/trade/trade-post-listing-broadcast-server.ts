import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { TradeListingThreadNotice } from "@/lib/trade/trade-listing-thread-notice";
import {
  TRADE_POST_LISTING_BROADCAST_EVENT,
  tradePostListingBroadcastChannelName,
} from "@/lib/trade/trade-post-listing-broadcast-channel";

function waitForChannelSubscribed(
  sb: SupabaseClient<any>,
  ch: RealtimeChannel,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        void sb.removeChannel(ch);
      } catch {
        /* ignore */
      }
      reject(new Error("trade_post_listing_channel_timeout"));
    }, timeoutMs);
    ch.subscribe((status) => {
      if (settled) return;
      if (status === "SUBSCRIBED") {
        settled = true;
        clearTimeout(t);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        settled = true;
        clearTimeout(t);
        try {
          void sb.removeChannel(ch);
        } catch {
          /* ignore */
        }
        reject(new Error(`trade_post_listing_channel_${status}`));
      }
    });
  });
}

/**
 * 판매 단계 저장 직후 — 동일 `postId` 거래 스레드(통합·레거시)를 보는 **모든 클라이언트**에 즉시 반영.
 * DB `postgres_changes` 지연·누락과 무관하게 동작한다.
 */
export async function publishTradePostListingUpdateFromServer(args: {
  postId: string;
  sellerListingState: string;
  postStatus: string;
  threadNotices: TradeListingThreadNotice[];
}): Promise<void> {
  let sb: SupabaseClient<any>;
  try {
    sb = getSupabaseServer();
  } catch {
    return;
  }
  const pid = args.postId.trim();
  if (!pid) return;
  const name = tradePostListingBroadcastChannelName(pid);
  const ch = sb.channel(name, { config: { broadcast: { ack: false } } });
  try {
    await waitForChannelSubscribed(sb, ch, 6500);
    await ch.send({
      type: "broadcast",
      event: TRADE_POST_LISTING_BROADCAST_EVENT,
      payload: {
        v: 1,
        postId: pid,
        sellerListingState: args.sellerListingState,
        postStatus: args.postStatus,
        threadNotices: args.threadNotices,
        at: new Date().toISOString(),
      },
    });
  } catch {
    /* Realtime 미설정·타임아웃 — HTTP·posts 구독으로 수렴 */
  } finally {
    try {
      void sb.removeChannel(ch);
    } catch {
      /* ignore */
    }
  }
}
