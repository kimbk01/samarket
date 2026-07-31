/**
 * Server Domain Badge Authority for GET /api/me/notifications/badge-count.
 *
 * Bell Contract B: bellTotal = unread approved notification_events (categoryCounts.total).
 * App Icon / Bottom / Hub = Domain unread room Facts (not Bell mirror).
 * categoryCounts also feeds inbox filter / diagnostics.
 *
 * P2-a/b LOCK (IO only):
 * - Trade / store_order rooms: ONE notification_targets SELECT (not five).
 * - Messenger GD+Group rooms: community_messenger_participants.unread_count (same as list row).
 * - Orphan missed: thin SELECT → in-memory COUNT + byRoom (byRoom required — canary/list).
 * - Builder / Projection Authority / Hub / room-fact / event-fact unchanged.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildNotificationBadgeProjection,
  type NotificationBadgeProjection,
  type NotificationNonChatEventAttentionFacts,
} from "@/lib/notifications/build-notification-badge-projection";
import { countNotificationEventsBadge } from "@/lib/notifications/core/notification-event-repository";
import type { NotificationBadgeCount } from "@/lib/notifications/core/notification-event-types";
import { logNotifyBadge } from "@/lib/notifications/core/notification-logs";
import { loadDomainBadgeTargetFacts } from "@/lib/notifications/load-domain-badge-target-facts";
import { loadMessengerUnreadRoomFactsFromParticipants } from "@/lib/notifications/load-messenger-unread-room-facts-from-participants";
import { loadOrphanMissedCallFacts } from "@/lib/notifications/load-orphan-missed-call-facts";

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
  /** Auditable room ID sets — messenger GD/Group from participants (not targets). */
  messengerUnreadRoomIds: {
    general_direct: readonly string[];
    group: readonly string[];
  };
  domainAppIcon: {
    messenger: number;
    trade: number;
    storeOrder: number;
    missedCall: number;
  };
  storeOrderBuyerDeliveryUnread: number;
  /** Owner order-chat rooms (fab_owner_order_chat / owner_order_chat). */
  storeOrderOwnerChatUnread: number;
  /** Bell Contract B — unread approved notification_events total. */
  unreadApprovedNotificationEvents: number;
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
 * Bell = approved event inbox total (Contract B). Domain room sums stay App Icon / Hub / Bottom.
 */
export async function buildDomainBadgeAuthorityHttpPayload(
  sb: SupabaseClient,
  userId: string
): Promise<DomainBadgeAuthorityHttpPayload> {
  const uid = userId.trim();
  const projectionVersionMs = Date.now();

  const [targetFacts, messengerRooms, missed, categoryCounts] = await Promise.all([
    loadDomainBadgeTargetFacts(sb, uid),
    loadMessengerUnreadRoomFactsFromParticipants(sb, uid),
    loadOrphanMissedCallFacts(sb, uid),
    countNotificationEventsBadge(sb, uid),
  ]);

  // Messenger GD+Group: participants unread (list SSOT). Trade/SO: targets.
  const domainUnreadRooms = {
    general_direct: messengerRooms.domainUnreadRooms.general_direct,
    group: messengerRooms.domainUnreadRooms.group,
    trade: targetFacts.domainUnreadRooms.trade,
    store_order: targetFacts.domainUnreadRooms.store_order,
  };
  const storeOrderBuyerDeliveryUnread = targetFacts.storeOrderBuyerDeliveryUnread;
  const storeOrderOwnerChatUnread = targetFacts.storeOrderOwnerChatUnread;
  const nonChatEventAttention = nonChatFromCategoryCounts(categoryCounts);
  const unreadApprovedNotificationEvents = Math.max(
    0,
    Math.floor(Number(categoryCounts.total) || 0)
  );

  const projection: NotificationBadgeProjection = buildNotificationBadgeProjection({
    domainUnreadRooms,
    storeOrderBuyerDeliveryUnread,
    storeOrderOwnerChatUnread,
    orphanMissedCall: missed.orphan,
    nonChatEventAttention,
    unreadApprovedNotificationEvents,
    bell: categoryCounts,
    rowUnreadByRoomId: {
      ...missed.byRoom,
      ...messengerRooms.rowUnreadByRoomId,
    },
  });

  const bell = projection.bell;
  logNotifyBadge("server_count", {
    userId: uid,
    authority: "domain_badge",
    bellTotal: projection.bellTotal,
    appIconTotal: projection.appIconTotal,
    bottomChat: projection.bottomChat,
    ...domainUnreadRooms,
    messenger_gd_rooms: messengerRooms.generalDirectUnreadRoomIds.length,
    messenger_group_rooms: messengerRooms.groupUnreadRoomIds.length,
    p2_target_select: 1,
    p2_messenger_participant_select: 1,
    p2_orphan_select: 1,
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
    messengerUnreadRoomIds: {
      general_direct: messengerRooms.generalDirectUnreadRoomIds,
      group: messengerRooms.groupUnreadRoomIds,
    },
    domainAppIcon: {
      messenger: projection.appIcon.messenger,
      trade: projection.appIcon.trade,
      storeOrder: projection.appIcon.storeOrder,
      missedCall: projection.appIcon.missedCall,
    },
    storeOrderBuyerDeliveryUnread,
    storeOrderOwnerChatUnread,
    unreadApprovedNotificationEvents,
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
