/**
 * 채팅 채널 분리
 * - 거래 채팅(상품·DM·커뮤니티 룸): API `/api/chat/*` + 아래 이벤트로만 미읽음 갱신
 * - 주문 채팅: `/api/order-chat/*` + `order_chat_*` 원장 (이 이벤트는 허브 새로고침 트리거용)
 */

/** 통합 채팅 미읽음 변경(거래·커뮤니티·매장 주문) — 하단 탭 배지·목록 즉시 갱신 */
export const KASAMA_TRADE_CHAT_UNREAD_UPDATED = "kasama:trade-chat-unread-updated";

/** 매장 접수·환불 카운트 등 오너 허브 배지 즉시 갱신 */
export const KASAMA_OWNER_HUB_BADGE_REFRESH = "kasama:owner-hub-badge-refresh";

/** 주문 제출 후 매장 탭「내 주문」배지 — `StoresHub` 가 주문 목록 재조회 */
export const KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH = "kasama:buyer-store-orders-hub-refresh";

/** 관리자 메인 하단 탭 설정 저장 — `BottomNav` 가 즉시 재조회 */
export const KASAMA_MAIN_BOTTOM_NAV_UPDATED = "kasama:main-bottom-nav-updated";

type ChatChannelDispatchDetail = {
  source?: string;
  key?: string;
  /** 동일 postId·다른 방에서 중복 갱신을 줄이기 위한 힌트(옵션) */
  roomId?: string;
  at: number;
};

const EVENT_DISPATCH_DEFAULT_DEDUPE_MS = 250;
const RECENT_EVENT_SIG_MAX = 200;
const recentEventDispatchAt = new Map<string, number>();

function capRecentEventDispatchSigs(): void {
  while (recentEventDispatchAt.size > RECENT_EVENT_SIG_MAX) {
    const k = recentEventDispatchAt.keys().next().value;
    if (k === undefined) break;
    recentEventDispatchAt.delete(k);
  }
}

function dispatchDedupedWindowEvent(eventName: string, detail: ChatChannelDispatchDetail, dedupeMs: number): void {
  if (typeof window === "undefined") return;
  const room = typeof detail.roomId === "string" && detail.roomId.trim() ? detail.roomId.trim() : "";
  const sig = `${eventName}:${detail.source ?? "unknown"}:${detail.key ?? "global"}${room ? `:room:${room}` : ""}`;
  const now = Date.now();
  const prev = recentEventDispatchAt.get(sig) ?? 0;
  if (now - prev < dedupeMs) return;
  recentEventDispatchAt.set(sig, now);
  capRecentEventDispatchSigs();
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

export function dispatchTradeChatUnreadUpdated(args?: {
  source?: string;
  key?: string;
  roomId?: string;
  dedupeMs?: number;
}): void {
  dispatchDedupedWindowEvent(
    KASAMA_TRADE_CHAT_UNREAD_UPDATED,
    {
      source: args?.source,
      key: args?.key,
      roomId: args?.roomId,
      at: Date.now(),
    },
    args?.dedupeMs ?? EVENT_DISPATCH_DEFAULT_DEDUPE_MS
  );
}

export function dispatchOwnerHubBadgeRefresh(args?: {
  source?: string;
  key?: string;
  dedupeMs?: number;
}): void {
  dispatchDedupedWindowEvent(
    KASAMA_OWNER_HUB_BADGE_REFRESH,
    {
      source: args?.source,
      key: args?.key,
      at: Date.now(),
    },
    args?.dedupeMs ?? EVENT_DISPATCH_DEFAULT_DEDUPE_MS
  );
}
