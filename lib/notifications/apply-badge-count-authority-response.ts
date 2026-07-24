/**
 * badge-count JSON → ProjectionInput → Builder → Apply.
 * Fact adapter only — does not invent Domain unread.
 */
"use client";

import {
  buildNotificationBadgeProjection,
  EMPTY_BELL_BADGE_FACTS,
  type NotificationBadgeProjectionInput,
  type NotificationNonChatEventAttentionFacts,
} from "@/lib/notifications/build-notification-badge-projection";
import { normalizeNotificationBadgeCountPayload } from "@/lib/notifications/notification-badge-count-store";
import { applyNotificationBadgeProjection } from "@/lib/messenger/contracts/domain-badge-authority-product-bridge";

export type BadgeCountAuthorityJson = {
  authority?: string;
  projectionVersionMs?: number;
  domainAppIcon?: {
    messenger?: number;
    trade?: number;
    storeOrder?: number;
    missedCall?: number;
  };
  domainUnreadRooms?: {
    general_direct?: number;
    group?: number;
    trade?: number;
    store_order?: number;
  };
  storeOrderBuyerDeliveryUnread?: number;
  philifeChatUnread?: number;
  nonChatEventAttention?: Partial<NotificationNonChatEventAttentionFacts>;
  missedCallByRoom?: Record<string, number>;
  [key: string]: unknown;
};

function nonChatFromBody(body: BadgeCountAuthorityJson): NotificationNonChatEventAttentionFacts {
  const n = body.nonChatEventAttention;
  if (n && typeof n === "object") {
    return {
      tradeStatus: Math.max(0, Math.floor(Number(n.tradeStatus) || 0)),
      orderStatus: Math.max(0, Math.floor(Number(n.orderStatus) || 0)),
      deliveryStatus: Math.max(0, Math.floor(Number(n.deliveryStatus) || 0)),
      communityActivity: Math.max(0, Math.floor(Number(n.communityActivity) || 0)),
      adminNotice: Math.max(0, Math.floor(Number(n.adminNotice) || 0)),
    };
  }
  const bell = normalizeNotificationBadgeCountPayload(body) ?? EMPTY_BELL_BADGE_FACTS;
  return {
    tradeStatus: Math.max(0, Math.floor(Number(bell.tradeStatus) || 0)),
    orderStatus: Math.max(0, Math.floor(Number(bell.orderStatus) || 0)),
    deliveryStatus: Math.max(0, Math.floor(Number(bell.deliveryStatus) || 0)),
    communityActivity: Math.max(0, Math.floor(Number(bell.communityActivity) || 0)),
    adminNotice: Math.max(0, Math.floor(Number(bell.adminNotice) || 0)),
  };
}

/**
 * Normalize badge-count (or Atomic projection Facts) into the single ProjectionInput.
 */
export function projectionInputFromBadgeCountAuthorityJson(
  body: BadgeCountAuthorityJson
): NotificationBadgeProjectionInput | null {
  const rooms = body.domainUnreadRooms;
  if (rooms && typeof rooms === "object") {
    const bell = normalizeNotificationBadgeCountPayload(body) ?? EMPTY_BELL_BADGE_FACTS;
    return {
      domainUnreadRooms: {
        general_direct: Math.max(0, Math.floor(Number(rooms.general_direct) || 0)),
        group: Math.max(0, Math.floor(Number(rooms.group) || 0)),
        trade: Math.max(0, Math.floor(Number(rooms.trade) || 0)),
        store_order: Math.max(0, Math.floor(Number(rooms.store_order) || 0)),
      },
      storeOrderBuyerDeliveryUnread: Math.max(
        0,
        Math.floor(Number(body.storeOrderBuyerDeliveryUnread) || 0)
      ),
      philifeChatUnread: Math.max(0, Math.floor(Number(body.philifeChatUnread) || 0)),
      orphanMissedCall: Math.max(
        0,
        Math.floor(Number(body.domainAppIcon?.missedCall ?? bell.missedCall) || 0)
      ),
      nonChatEventAttention: nonChatFromBody(body),
      rowUnreadByRoomId: body.missedCallByRoom ?? {},
    };
  }
  const icon = body.domainAppIcon;
  if (!icon || typeof icon !== "object") return null;
  const messenger = Math.max(0, Math.floor(Number(icon.messenger) || 0));
  const trade = Math.max(0, Math.floor(Number(icon.trade) || 0));
  const storeOrder = Math.max(0, Math.floor(Number(icon.storeOrder) || 0));
  const buyer = Math.max(0, Math.floor(Number(body.storeOrderBuyerDeliveryUnread) || 0));
  return {
    domainUnreadRooms: {
      general_direct: messenger,
      group: 0,
      trade,
      store_order: Math.max(0, storeOrder - buyer),
    },
    storeOrderBuyerDeliveryUnread: buyer,
    orphanMissedCall: Math.max(0, Math.floor(Number(icon.missedCall) || 0)),
    nonChatEventAttention: nonChatFromBody(body),
    rowUnreadByRoomId: body.missedCallByRoom ?? {},
  };
}

export function applyAuthorityJsonAsProjection(
  body: BadgeCountAuthorityJson | Record<string, unknown>,
  opts?: { applyBell?: boolean; projectionVersionMs?: number }
): boolean {
  const input = projectionInputFromBadgeCountAuthorityJson(body as BadgeCountAuthorityJson);
  if (!input) return false;
  const projection = buildNotificationBadgeProjection(input);
  const versionMs = Math.max(
    0,
    Math.floor(
      Number(opts?.projectionVersionMs ?? (body as BadgeCountAuthorityJson).projectionVersionMs) ||
        Date.now()
    )
  );
  applyNotificationBadgeProjection(projection, {
    applyBell: opts?.applyBell !== false,
    projectionVersionMs: versionMs,
  });
  return true;
}
