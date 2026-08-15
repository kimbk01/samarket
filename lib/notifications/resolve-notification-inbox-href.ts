import { tradeMessengerRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import type { ChatRoomSource } from "@/lib/types/chat";
import { isCustomerCenterContentType } from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardDetailPath } from "@/lib/notices/customer-center-content-paths";
import { isOwnerStoreCommerceNotificationRow } from "@/lib/notifications/owner-store-commerce-notification-meta";
import { resolveSafeNotificationInternalRoute } from "@/lib/notifications/policy/notification-internal-route";

export type InboxHrefRow = {
  id?: string | null;
  notification_type: string;
  link_url: string | null;
  meta?: Record<string, unknown> | null;
  push_kind?: string | null;
  bell_presentation_type?: string | null;
  event_type?: string | null;
  campaign_type?: string | null;
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

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function buildNotificationDetailHref(notificationId: string | null | undefined): `/notifications/${string}` | null {
  const id = trimText(notificationId);
  return id ? `/notifications/${encodeURIComponent(id)}` : null;
}

export function isBareNotificationsCenterHref(href: string | null | undefined): boolean {
  const raw = trimText(href);
  if (!raw) return false;
  try {
    const u = new URL(raw, "https://samarket.local");
    if (u.pathname !== "/notifications") return false;
    return u.searchParams.get("fallback") !== "origin_unavailable";
  } catch {
    const pathOnly = raw.split("?")[0] ?? raw;
    return pathOnly === "/notifications" && !raw.includes("fallback=origin_unavailable");
  }
}

/**
 * Content-bound Customer Center board from inbox row meta / link.
 * Priority over notification-only detail.
 */
export function resolveCustomerCenterBoardFromInboxRow(row: InboxHrefRow): string | null {
  const meta =
    row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : null;
  const canonical = trimText(meta?.canonical_route);
  if (canonical.includes("/mypage/customer-center/")) {
    return resolveSafeNotificationInternalRoute(canonical, defaultInboxFallbackHref());
  }
  const link = trimText(row.link_url);
  if (link.includes("/mypage/customer-center/")) {
    return resolveSafeNotificationInternalRoute(link, defaultInboxFallbackHref());
  }
  const contentId = trimText(
    meta?.content_id ?? meta?.appNoticeId ?? meta?.app_notice_id
  );
  if (!contentId) return null;
  const contentTypeRaw = trimText(meta?.content_type) || trimText(row.campaign_type);
  if (!isCustomerCenterContentType(contentTypeRaw)) return null;
  return buildCustomerCenterBoardDetailPath(contentTypeRaw, contentId);
}

/**
 * True only when the notification itself is the destination
 * (no content board bind, no domain-specific original route).
 * Campaign type alone does NOT force notification-only.
 */
export function isNotificationOnlyInboxRow(row: InboxHrefRow): boolean {
  const id = trimText(row.id);
  if (!id) return false;
  if (resolveCustomerCenterBoardFromInboxRow(row)) return false;
  const link = trimText(row.link_url);
  if (
    link &&
    !isBareNotificationsCenterHref(link) &&
    !isNotificationOriginUnavailableFallback(link)
  ) {
    return false;
  }
  const campaignType = trimText(row.campaign_type).toLowerCase();
  if (campaignType === "notice" || campaignType === "system" || campaignType === "marketing") {
    return true;
  }
  const eventType = trimText(row.event_type).toLowerCase();
  if (eventType === "notice_published" || eventType === "admin_marketing_banner") {
    return true;
  }
  const pushKind = trimText(row.push_kind).toLowerCase();
  const bell = trimText(row.bell_presentation_type).toLowerCase();
  if (
    eventType === "admin_notice" &&
    (pushKind === "notice" ||
      pushKind === "system" ||
      bell === "admin_notice" ||
      bell === "admin_system")
  ) {
    return true;
  }
  return false;
}

export function resolveNotificationOnlyDetailHref(row: InboxHrefRow): `/notifications/${string}` | null {
  return isNotificationOnlyInboxRow(row) ? buildNotificationDetailHref(row.id) : null;
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
  const board = resolveCustomerCenterBoardFromInboxRow(r);
  if (board) return board;

  const trade = resolveTradeOfferInboxHref(r);
  if (trade != null && trade.length > 0) {
    return resolveSafeNotificationInternalRoute(
      trade,
      defaultInboxFallbackHref()
    );
  }

  const u = r.link_url?.trim();
  if (!u) {
    return resolveNotificationOnlyDetailHref(r);
  }
  if (isNotificationOriginUnavailableFallback(u)) {
    return defaultInboxFallbackHref();
  }
  if (isBareNotificationsCenterHref(u)) {
    return resolveNotificationOnlyDetailHref(r) ?? defaultInboxFallbackHref();
  }
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
  // Explicit fallback only when exact origin is missing/deleted — not a silent dump.
  return "/notifications?fallback=origin_unavailable";
}

/** True when href is the intentional "origin unavailable" NC fallback. */
export function isNotificationOriginUnavailableFallback(href: string | null | undefined): boolean {
  const t = String(href ?? "").trim();
  if (!t) return false;
  try {
    const u = new URL(t, "https://samarket.local");
    return (
      u.pathname === "/notifications" && u.searchParams.get("fallback") === "origin_unavailable"
    );
  } catch {
    return t.includes("fallback=origin_unavailable");
  }
}
