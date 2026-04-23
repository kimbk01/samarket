import type { TradeListingThreadNotice } from "@/lib/trade/trade-listing-thread-notice";

/** Supabase Realtime Broadcast 이벤트 — `postgres_changes`·탭 간 BC에 의존하지 않는 즉시 동기화 */
export const TRADE_POST_LISTING_BROADCAST_EVENT = "trade_post_listing_v1";

export function tradePostListingBroadcastChannelName(postId: string): string {
  const id = postId.trim();
  if (!id) return "samarket:trade-post-listing:invalid";
  return `samarket:trade-post-listing:${id}`;
}

/** 서버 송신·클라 수신 동일 계약 */
export type TradePostListingBroadcastPayload = {
  v: 1;
  postId: string;
  sellerListingState: string | null;
  postStatus: string | null;
  threadNotices: TradeListingThreadNotice[];
  at: string;
};
