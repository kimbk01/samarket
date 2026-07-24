/**
 * Server Domain Badge Authority for GET /api/me/notifications/badge-count.
 *
 * Header Bell / App Icon / Bottom facts — NOT notification_events chat message SUM.
 * categoryCounts remains for inbox filter / diagnostics only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMessengerChatRoomUnreadTargetRoomIds } from "@/lib/messenger/contracts/chat-room-unread-from-notification-targets";
import { loadTradeUnreadTargetIdentityKeys } from "@/lib/messenger/trade/unread-from-notification-targets";
import {
  loadStoreOrderOwnerUnreadTargetIndex,
  loadStoreOrderUnreadTargetOrderIds,
  STORE_ORDER_CUSTOMER_UNREAD_TARGET_TYPE,
} from "@/lib/messenger/store-order/unread-from-notification-targets";
import {
  buildNotificationBadgeProjection,
  type NotificationBadgeProjection,
  type NotificationNonChatEventAttentionFacts,
} from "@/lib/notifications/build-notification-badge-projection";
import { countNotificationEventsBadge } from "@/lib/notifications/core/notification-event-repository";
import type { NotificationBadgeCount } from "@/lib/notifications/core/notification-event-types";
import { logNotifyBadge } from "@/lib/notifications/core/notification-logs";

export type DomainBadgeAuthorityHttpPayload = {
  ok: true;
  authority: "domain_badge";
  projectionVersionMs: number;
  projection: {
    bellTotal: number;
    appIconTotal: number;
    bottomChatTotal: number;
    domainUnread: {
      general_direct: number;
      group: number;
      trade: number;
      store_order: number;
    };
    orphanMissedCallCount: number;
    nonChatNotificationCount: number;
  };
  domainUnreadRooms: {
    general_direct: number;
    group: number;
    trade: number;
    store_order: number;
  };
  domainAppIcon: {
    messenger: number;
    trade: number;
    storeOrder: number;
    missedCall: number;
  };
  storeOrderBuyerDeliveryUnread: number;
  nonChatEventAttention: NotificationNonChatEventAttentionFacts;
  missedCallByRoom: Record<string, number>;
  /** Product Bell snapshot fields (Builder output) — Header digit SSOT. */
  total: number;
  chatMessage: number;
  groupMessage: number;
  tradeMessage: number;
  tradeStatus: number;
  orderStatus: number;
  deliveryStatus: number;
  communityActivity: number;
  adminMarketingBanner: number;
  adminNotice: number;
  chat: number;
  group: number;
  trade: number;
  store: number;
  missedCall: number;
  /** Inbox filter / diagnostics only — never Bell authority. */
  categoryCounts: NotificationBadgeCount;
};

async function countOrphanMissedCallEvents(
  sb: SupabaseClient,
  userId: string
): Promise<{ orphan: number; byRoom: Record<string, number> }> {
  const uid = userId.trim();
  if (!uid) return { orphan: 0, byRoom: {} };
  const { data, error } = await sb
    .from("notification_events")
    .select("room_id, muted_snapshot, display_payload")
    .eq("user_id", uid)
    .eq("unread", true)
    .is("read_at", null)
    .eq("category", "missed_call");
  if (error || !data) return { orphan: 0, byRoom: {} };

  let orphan = 0;
  const byRoom: Record<string, number> = {};
  for (const row of data as Array<{
    room_id?: string | null;
    muted_snapshot?: boolean | null;
    display_payload?: unknown;
  }>) {
    // Match badge eligibility loosely — exclude muted badge flags in payload when present.
    const payload = row.display_payload;
    if (payload && typeof payload === "object") {
      const p = payload as Record<string, unknown>;
      if (p.badge_enabled === false || p.badgeEnabled === false) continue;
      if (p.exclude_from_badge === true || p.excludeFromBadge === true) continue;
      if (p.mute_badge === true || p.muteBadge === true) continue;
      if (p.deleted === true || p.isDeleted === true) continue;
    }
    const roomId = typeof row.room_id === "string" ? row.room_id.trim() : "";
    if (!roomId) {
      orphan += 1;
      continue;
    }
    byRoom[roomId] = (byRoom[roomId] ?? 0) + 1;
  }
  return { orphan, byRoom };
}

function nonChatFromCategoryCounts(c: NotificationBadgeCount): NotificationNonChatEventAttentionFacts {
  return {
    tradeStatus: Math.max(0, Math.floor(Number(c.tradeStatus) || 0)),
    orderStatus: Math.max(0, Math.floor(Number(c.orderStatus) || 0)),
    deliveryStatus: Math.max(0, Math.floor(Number(c.deliveryStatus) || 0)),
    communityActivity: Math.max(0, Math.floor(Number(c.communityActivity) || 0)),
    adminNotice: Math.max(0, Math.floor(Number(c.adminNotice) || 0)),
  };
}

/**
 * Collect Domain Facts → Builder → HTTP payload.
 * DO NOT return events chat_message/group_message/trade_message SUM as Bell total.
 */
export async function buildDomainBadgeAuthorityHttpPayload(
  sb: SupabaseClient,
  userId: string
): Promise<DomainBadgeAuthorityHttpPayload> {
  const uid = userId.trim();
  const projectionVersionMs = Date.now();

  const [
    gdRooms,
    groupRooms,
    tradeKeys,
    buyerOrderIds,
    ownerIndex,
    missed,
    categoryCounts,
  ] = await Promise.all([
    loadMessengerChatRoomUnreadTargetRoomIds(sb, {
      viewerUserId: uid,
      domains: ["general_direct"],
    }),
    loadMessengerChatRoomUnreadTargetRoomIds(sb, {
      viewerUserId: uid,
      domains: ["group"],
    }),
    loadTradeUnreadTargetIdentityKeys(sb, uid),
    loadStoreOrderUnreadTargetOrderIds(sb, {
      viewerUserId: uid,
      targetType: STORE_ORDER_CUSTOMER_UNREAD_TARGET_TYPE,
    }),
    loadStoreOrderOwnerUnreadTargetIndex(sb, uid),
    countOrphanMissedCallEvents(sb, uid),
    countNotificationEventsBadge(sb, uid),
  ]);

  const storeOrderAttention = new Set<string>();
  for (const id of buyerOrderIds) storeOrderAttention.add(`buyer:${id}`);
  for (const id of ownerIndex.roomIds) storeOrderAttention.add(`owner_room:${id}`);
  for (const id of ownerIndex.orderIds) storeOrderAttention.add(`owner_order:${id}`);

  const domainUnreadRooms = {
    general_direct: gdRooms.size,
    group: groupRooms.size,
    trade: tradeKeys.size,
    store_order: storeOrderAttention.size,
  };
  const storeOrderBuyerDeliveryUnread = buyerOrderIds.size;
  const nonChatEventAttention = nonChatFromCategoryCounts(categoryCounts);

  const projection: NotificationBadgeProjection = buildNotificationBadgeProjection({
    domainUnreadRooms,
    storeOrderBuyerDeliveryUnread,
    orphanMissedCall: missed.orphan,
    nonChatEventAttention,
    rowUnreadByRoomId: missed.byRoom,
  });

  const bell = projection.bell;
  logNotifyBadge("server_count", {
    userId: uid,
    authority: "domain_badge",
    bellTotal: projection.bellTotal,
    appIconTotal: projection.appIconTotal,
    bottomChat: projection.bottomChat,
    ...domainUnreadRooms,
  });

  return {
    ok: true,
    authority: "domain_badge",
    projectionVersionMs,
    projection: {
      bellTotal: projection.bellTotal,
      appIconTotal: projection.appIconTotal,
      bottomChatTotal: projection.bottomChat,
      domainUnread: { ...domainUnreadRooms },
      orphanMissedCallCount: missed.orphan,
      nonChatNotificationCount: projection.bellNonChatEventCount,
    },
    domainUnreadRooms,
    domainAppIcon: {
      messenger: projection.appIcon.messenger,
      trade: projection.appIcon.trade,
      storeOrder: projection.appIcon.storeOrder,
      missedCall: projection.appIcon.missedCall,
    },
    storeOrderBuyerDeliveryUnread,
    nonChatEventAttention,
    missedCallByRoom: missed.byRoom,
    total: Math.max(0, Math.floor(Number(bell.total) || 0)),
    chatMessage: Math.max(0, Math.floor(Number(bell.chatMessage) || 0)),
    groupMessage: Math.max(0, Math.floor(Number(bell.groupMessage) || 0)),
    tradeMessage: Math.max(0, Math.floor(Number(bell.tradeMessage) || 0)),
    tradeStatus: Math.max(0, Math.floor(Number(bell.tradeStatus) || 0)),
    orderStatus: Math.max(0, Math.floor(Number(bell.orderStatus) || 0)),
    deliveryStatus: Math.max(0, Math.floor(Number(bell.deliveryStatus) || 0)),
    communityActivity: Math.max(0, Math.floor(Number(bell.communityActivity) || 0)),
    adminMarketingBanner: Math.max(0, Math.floor(Number(bell.adminMarketingBanner) || 0)),
    adminNotice: Math.max(0, Math.floor(Number(bell.adminNotice) || 0)),
    chat: Math.max(0, Math.floor(Number(bell.chat) || 0)),
    group: Math.max(0, Math.floor(Number(bell.group) || 0)),
    trade: Math.max(0, Math.floor(Number(bell.trade) || 0)),
    store: Math.max(0, Math.floor(Number(bell.store) || 0)),
    missedCall: Math.max(0, Math.floor(Number(bell.missedCall) || 0)),
    categoryCounts,
  };
}
