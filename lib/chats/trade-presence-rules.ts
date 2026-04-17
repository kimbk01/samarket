import type { TradePresenceAudience } from "@/lib/chats/trade-presence-policy";

export function parseTradePresenceAudience(raw: unknown): TradePresenceAudience | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "everyone" || s === "friends" || s === "nobody") return s;
  return null;
}

/** 마지막 접속 상호 숨김(카톡/텔레 방식) */
export function tradePresenceCanSeePeerLastSeen(viewerHideLastSeen: boolean, peerHideLastSeen: boolean): boolean {
  return !viewerHideLastSeen && !peerHideLastSeen;
}

/**
 * 거래 상대에게 live(점·브로드캐스트) 노출 가능 여부.
 * `friends` 는 거래방·목록 API 등 **이미 관계가 검증된 맥락**에서만 허용한다.
 */
export function tradePresencePeerAllowsLiveShare(peer: {
  trade_presence_show_online: boolean;
  trade_presence_audience: string;
}): boolean {
  if (!peer.trade_presence_show_online) return false;
  const a = peer.trade_presence_audience;
  if (a === "nobody") return false;
  return a === "everyone" || a === "friends";
}

export function tradePresenceViewerMayPublishLive(viewer: {
  trade_presence_show_online: boolean;
  trade_presence_audience: string;
}): boolean {
  return tradePresencePeerAllowsLiveShare({
    trade_presence_show_online: viewer.trade_presence_show_online,
    trade_presence_audience: viewer.trade_presence_audience,
  });
}
