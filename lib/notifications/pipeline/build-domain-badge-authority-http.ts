/**
 * Server Domain Badge Authority for GET /api/me/notifications/badge-count.
 *
 * Bell Contract B: bellTotal = unread approved notification_events (categoryCounts.total).
 * App Icon / Bottom / Hub = Domain unread room Facts (not Bell mirror).
 * categoryCounts also feeds inbox filter / diagnostics.
 *
 * P2-a/b LOCK (IO only):
 * - Messenger GD+Group rooms: community_messenger_participants.unread_count (same as list row).
 * - Trade / store_order rooms: community_messenger_participants.unread_count (same as list row;
 *   role-scoped for store_order; phantoms excluded). notification_targets are derived only.
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
import {
  buildBadgeExplainMatrix,
  type BadgeExplainMatrix,
} from "@/lib/notifications/badge-explain-matrix";
import {
  buildBellExplainMatrix,
  type BellExplainMatrix,
} from "@/lib/notifications/bell-explain-matrix";
import { loadBellExplainUnreadEventRows } from "@/lib/notifications/load-bell-explain-unread-events";
import { loadMessengerUnreadRoomFactsFromParticipants } from "@/lib/notifications/load-messenger-unread-room-facts-from-participants";
import { loadOrphanMissedCallFacts } from "@/lib/notifications/load-orphan-missed-call-facts";
import { loadTradeStoreOrderUnreadRoomFactsFromParticipants } from "@/lib/notifications/load-trade-store-order-unread-room-facts-from-participants";

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
  /** Auditable room ID sets — messenger / trade / SO from participants (not targets). */
  messengerUnreadRoomIds: {
    general_direct: readonly string[];
    group: readonly string[];
  };
  tradeUnreadRoomIds: readonly string[];
  storeOrderUnreadRoomIds: {
    customer: readonly string[];
    owner: readonly string[];
  };
  /**
   * Phase 2-1 Explain Matrix — surface digit = ID set + count (Runtime proof).
   * App Icon / Bottom / Trade / Customer / Owner.
   */
  explainMatrix: BadgeExplainMatrix;
  /**
   * Phase 3-1 Bell Explain Matrix — bellTotal = kind parts + event ID sets.
   * DO NOT use for App Icon. Badge HARD LOCK.
   */
  bellExplainMatrix: BellExplainMatrix;
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

  const [messengerRooms, tradeStoreRooms, missed, categoryCounts, bellExplainRows] =
    await Promise.all([
      loadMessengerUnreadRoomFactsFromParticipants(sb, uid),
      loadTradeStoreOrderUnreadRoomFactsFromParticipants(sb, uid),
      loadOrphanMissedCallFacts(sb, uid),
      countNotificationEventsBadge(sb, uid),
      loadBellExplainUnreadEventRows(sb, uid),
    ]);

  // Messenger + Trade + Store Order: participants unread (list SSOT). Targets are derived only.
  const domainUnreadRooms = {
    general_direct: messengerRooms.domainUnreadRooms.general_direct,
    group: messengerRooms.domainUnreadRooms.group,
    trade: tradeStoreRooms.domainUnreadRooms.trade,
    store_order: tradeStoreRooms.domainUnreadRooms.store_order,
  };
  const storeOrderBuyerDeliveryUnread = tradeStoreRooms.storeOrderBuyerDeliveryUnread;
  const storeOrderOwnerChatUnread = tradeStoreRooms.storeOrderOwnerChatUnread;
  const nonChatEventAttention = nonChatFromCategoryCounts(categoryCounts);
  const unreadApprovedNotificationEvents = Math.max(
    0,
    Math.floor(Number(categoryCounts.total) || 0)
  );

  const projection: NotificationBadgeProjection = buildNotificationBadgeProjection({
    domainUnreadRooms,
    storeOrderBuyerDeliveryUnread,
    storeOrderOwnerChatUnread,
    storeOrderOwnerUnreadByStoreId: tradeStoreRooms.ownerOrderUnreadByStoreId,
    orphanMissedCall: missed.orphan,
    nonChatEventAttention,
    unreadApprovedNotificationEvents,
    bell: categoryCounts,
    rowUnreadByRoomId: {
      ...missed.byRoom,
      ...messengerRooms.rowUnreadByRoomId,
      ...tradeStoreRooms.rowUnreadByRoomId,
    },
  });

  const bell = projection.bell;
  const explainMatrix = buildBadgeExplainMatrix({
    generalDirectRoomIds: messengerRooms.generalDirectUnreadRoomIds,
    groupRoomIds: messengerRooms.groupUnreadRoomIds,
    tradeRoomIds: tradeStoreRooms.tradeUnreadRoomIds,
    customerOrderRoomIds: tradeStoreRooms.customerOrderUnreadRoomIds,
    ownerOrderRoomIds: tradeStoreRooms.ownerOrderUnreadRoomIds,
    ownerOrderUnreadByStoreId: tradeStoreRooms.ownerOrderUnreadByStoreId,
    orphanMissedCallCount: missed.orphan,
    orphanMissedCallEventIds: missed.orphanEventIds,
  });
  const bellExplainMatrix = buildBellExplainMatrix(bellExplainRows);

  logNotifyBadge("server_count", {
    userId: uid,
    authority: "domain_badge",
    bellTotal: projection.bellTotal,
    appIconTotal: projection.appIconTotal,
    bottomChat: projection.bottomChat,
    ...domainUnreadRooms,
    messenger_gd_rooms: messengerRooms.generalDirectUnreadRoomIds.length,
    messenger_group_rooms: messengerRooms.groupUnreadRoomIds.length,
    trade_rooms: tradeStoreRooms.tradeUnreadRoomIds.length,
    so_customer_rooms: tradeStoreRooms.customerOrderUnreadRoomIds.length,
    so_owner_rooms: tradeStoreRooms.ownerOrderUnreadRoomIds.length,
    explain_app_icon: explainMatrix.appIcon.total,
    explain_bell: bellExplainMatrix.total,
    p2_messenger_participant_select: 1,
    p2_trade_so_participant_select: 1,
    p2_orphan_select: 1,
    p3_bell_explain_select: 1,
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
    tradeUnreadRoomIds: tradeStoreRooms.tradeUnreadRoomIds,
    storeOrderUnreadRoomIds: {
      customer: tradeStoreRooms.customerOrderUnreadRoomIds,
      owner: tradeStoreRooms.ownerOrderUnreadRoomIds,
    },
    explainMatrix,
    bellExplainMatrix,
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
