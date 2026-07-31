import { tradeMessengerRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import type { ChatRoomSource } from "@/lib/types/chat";
import { isOwnerStoreCommerceNotificationRow } from "@/lib/notifications/owner-store-commerce-notification-meta";
import { resolveSafeNotificationInternalRoute } from "@/lib/notifications/policy/notification-internal-route";

export type InboxHrefRow = {
  notification_type: string;
  link_url: string | null;
  meta?: Record<string, unknown> | null;
};

/** 헤더 알림 「가격 제안 도착」→ 상세 진입 시 받은 제안 모달 (`PostDetailView`) */
export const OPEN_RECEIVED_OFFERS_SEARCH_PARAM = "openReceivedOffers";

/** `offer_created` 인박스 이동용 — 레거시 `link_url`에도 쿼리 보강 */
export function appendOpenReceivedOffersToPostDetailHref(href: string): string {
  const t = href.trim();
  if (!t) return t;
  try {
    if (t.startsWith("http://") || t.startsWith("https://")) {
      const u = new URL(t);
      if (!u.pathname.startsWith("/post/")) return t;
      u.searchParams.set(OPEN_RECEIVED_OFFERS_SEARCH_PARAM, "1");
      return `${u.pathname}${u.search}${u.hash}`;
    }
    const u = new URL(t, "https://samarket.local");
    if (!u.pathname.startsWith("/post/")) return t;
    u.searchParams.set(OPEN_RECEIVED_OFFERS_SEARCH_PARAM, "1");
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return t;
  }
}

function tradeOfferEvent(meta: Record<string, unknown>): string | null {
  const nt = typeof meta.notification_type === "string" ? meta.notification_type.trim() : "";
  if (nt === "offer_created" || nt === "offer_accepted" || nt === "offer_rejected") return nt;
  const ev = typeof meta.event === "string" ? meta.event.trim() : "";
  if (ev === "offer_created" || ev === "offer_accepted" || ev === "offer_rejected") return ev;
  const st = typeof meta.spec_type === "string" ? meta.spec_type.trim() : "";
  if (st === "offer_created" || st === "offer_accepted" || st === "offer_rejected") return st;
  return null;
}

function tradeOfferMessengerHref(roomId: string, roomSource: unknown): string {
  const src =
    roomSource === "chat_room" || roomSource === "product_chat"
      ? (roomSource as ChatRoomSource)
      : null;
  return tradeMessengerRoomHref(roomId, src);
}

/** `meta.kind === trade_offer` 인 알림: 레거시·누락 `link_url` 보정 및 수락 시 채팅 우선 */
function resolveTradeOfferInboxHref(r: InboxHrefRow): string | null {
  const meta = r.meta;
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  if (m.kind !== "trade_offer") return null;

  const event = tradeOfferEvent(m);
  const linkTrim = r.link_url?.trim() ?? "";
  const productId =
    typeof m.product_id === "string" && m.product_id.trim().length > 0 ? m.product_id.trim() : "";

  if (!event) {
    if (linkTrim.length > 0) return linkTrim;
    if (productId) return `/post/${encodeURIComponent(productId)}`;
    return null;
  }

  if (event === "offer_accepted") {
    const roomId =
      (typeof m.chat_room_id === "string" && m.chat_room_id.trim()) ||
      (typeof m.room_id === "string" && m.room_id.trim()) ||
      "";
    if (roomId) {
      return tradeOfferMessengerHref(roomId, m.room_source);
    }
    if (linkTrim.length > 0) return linkTrim;
    return productId ? `/post/${encodeURIComponent(productId)}` : null;
  }

  if (event === "offer_created") {
    if (linkTrim.length > 0) return appendOpenReceivedOffersToPostDetailHref(linkTrim);
    if (productId) {
      return `/post/${encodeURIComponent(productId)}?${OPEN_RECEIVED_OFFERS_SEARCH_PARAM}=1`;
    }
    return "/my/offers/received";
  }

  if (event === "offer_rejected") {
    if (linkTrim.length > 0) return linkTrim;
    if (productId) return `/post/${encodeURIComponent(productId)}`;
    return "/my/offers/sent";
  }

  return null;
}

/**
 * 구매자 매장 주문 알림: 주문 상세로 직행. 오너 commerce는 link_url 그대로.
 */
export function resolveNotificationInboxHref(r: InboxHrefRow): string | null {
  const trade = resolveTradeOfferInboxHref(r);
  if (trade != null && trade.length > 0) {
    return resolveSafeNotificationInternalRoute(
      trade,
      defaultInboxFallbackHref()
    );
  }

  const u = r.link_url?.trim();
  if (!u) return null;
  if (r.notification_type !== "commerce") {
    return resolveSafeNotificationInternalRoute(
      u,
      defaultInboxFallbackHref()
    );
  }
  if (isOwnerStoreCommerceNotificationRow(r)) {
    return resolveSafeNotificationInternalRoute(
      u,
      defaultInboxFallbackHref()
    );
  }
  return resolveSafeNotificationInternalRoute(
    u,
    defaultInboxFallbackHref()
  );
}

export function defaultInboxFallbackHref(): string {
  return "/mypage/notifications#notification-inbox";
}
