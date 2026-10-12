import { publishMessengerPrivateBroadcastFromServer } from "@/lib/community-messenger/realtime/private-broadcast-server";
import type { TradeListingThreadNotice } from "@/lib/trade/trade-listing-thread-notice";
import {
  TRADE_POST_LISTING_BROADCAST_EVENT,
  tradePostListingBroadcastChannelName,
} from "@/lib/trade/trade-post-listing-broadcast-channel";

/**
 * 판매 단계 저장 직후 — 동일 `postId` 거래 스레드(통합·레거시)를 보는 **권한이 있는 클라이언트**에 즉시 반영.
 * Private REST broadcast (`private: true`) — service_role; join 불필요.
 * 수신: `realtime.messages` SELECT = `trade_can_access_post_listing_broadcast(postId)`.
 */
export async function publishTradePostListingUpdateFromServer(args: {
  postId: string;
  sellerListingState: string;
  postStatus: string;
  threadNotices: TradeListingThreadNotice[];
}): Promise<void> {
  const pid = args.postId.trim();
  if (!pid) return;
  const topic = tradePostListingBroadcastChannelName(pid);
  await publishMessengerPrivateBroadcastFromServer({
    scope: "trade-post-listing",
    messages: [
      {
        topic,
        event: TRADE_POST_LISTING_BROADCAST_EVENT,
        payload: {
          v: 1,
          postId: pid,
          sellerListingState: args.sellerListingState,
          postStatus: args.postStatus,
          threadNotices: args.threadNotices,
          at: new Date().toISOString(),
        },
      },
    ],
  });
}
