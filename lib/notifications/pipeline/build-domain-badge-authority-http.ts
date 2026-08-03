/**
 * Server Domain Badge Authority for GET /api/me/notifications/badge-count.
 *
 * Phase B Formula SSOT (App Icon — unchanged in Slice 2-2):
 *   ChatAttentionTotal = unread room ID sets (GD+Group+Trade+Customer+Owner)
 *   NotificationAttentionTotal = distinct non-chat attention_key
 *   AppIconTotal = Chat + Notification
 *
 * Slice 2-2 Bell digit:
 *   memberUnreadNotificationCount = A_member only
 *   (owner_intake / chat / missed / marketing excluded)
 *
 * categoryCounts remain inbox filter / diagnostics (may include chat rows).
 *
 * P2-a/b LOCK (IO only):
 * - Messenger / Trade / store_order rooms: community_messenger_participants.unread_count.
 * - Orphan missed: thin SELECT → byRoom for list; orphan keys enter NotificationAttention.
 * - DO NOT reopen RoomUnread writers from this module.
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
import {
  buildUnifiedAppIconProjection,
  type UnifiedAppIconProjection,
} from "@/lib/notifications/chat-notification-attention-projection";
import { deriveMemberUnreadNotificationCount } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-projection";
import { loadOwnerOperationOFacts } from "@/lib/notifications/badge-authority-rebuild/load-owner-operation-o-facts";
import { resolveMemberNotificationAuthorityFromRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority";
import {
  projectSurfacesFromConversationAuthority,
  resolveMemberConversationAuthority,
  type MemberConversationAuthority,
} from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";
import {
  resolveMemberAppIconAuthority,
  type MemberAppIconAuthority,
} from "@/lib/notifications/badge-authority-rebuild/member-app-icon-authority";
import { conversationRoomsFromParticipantFactsNormalized } from "@/lib/notifications/badge-authority-rebuild/conversation-b-from-participant-facts";
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
   * App Icon chat rooms + NotificationAttention; Bottom / Trade / Customer / Owner.
   */
  explainMatrix: BadgeExplainMatrix;
  /**
   * Phase 3-1 Bell Explain Matrix — kind parts for diagnostics.
   * Digit SSOT = unifiedAttention.notification.total (not chat event SUM).
   */
  bellExplainMatrix: BellExplainMatrix;
  /** Phase B — Chat + Notification + App Icon unified projection. */
  unifiedAttention: UnifiedAppIconProjection;
  domainAppIcon: {
    messenger: number;
    trade: number;
    storeOrder: number;
    /** NotificationAttentionTotal (surface wire field name retained). */
    missedCall: number;
  };
  storeOrderBuyerDeliveryUnread: number;
  /** Owner order-chat rooms (fab_owner_order_chat / owner_order_chat). */
  storeOrderOwnerChatUnread: number;
  /** @deprecated Raw eligible event row count (includes chat). Prefer unifiedAttention.notification.total. */
  unreadApprovedNotificationEvents: number;
  /** Product Bell digit = NotificationAttentionTotal. */
  notificationAttentionTotal: number;
  nonChatEventAttention: NotificationNonChatEventAttentionFacts;
  missedCallByRoom: Record<string, number>;
  /** Product Bell digit = A_member (N) only (= projection.bellTotal). */
  total: number;
  /** N axis only (A_member) — not the full Bell digit. */
  memberUnreadNotificationCount: number;
  /** O axis — owner operation count (|O| / O_bell). */
  ownerOperationCount: number;
  ownerOperationBellCount: number;
  /** Slice 2-3 — orphan missed Fact (client Apply). */
  orphanMissedCallCount: number;
  /** Slice 2-3 — distinct unresolved missed call/session ids. */
  unresolvedMissedCallIds: readonly string[];
  /** Slice 2-3 — Member B room count (owner excluded). */
  memberUnreadRoomCount: number;
  /** Slice 2-3 — unresolved missed for B_member. */
  memberUnresolvedMissedCallCount: number;
  /** Gate 3 Step 6 — A + Conversation B rooms (canonical; no orphan re-add). */
  memberAppIconWebTotal: number;
  /**
   * Gate 3 Step 5 — Conversation Authority B (rooms only).
   * B = general+group+trade+customer order unread rooms.
   */
  memberConversationAuthority: MemberConversationAuthority;
  memberConversationUnreadRooms: number;
  /** Gate 3 Step 6 — full App Icon snapshot (components + versions). */
  memberAppIconAuthority: MemberAppIconAuthority;
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
 * Collect Domain Facts → unified Formula → Builder → HTTP payload.
 * Bell digit / App Icon notification axis = NotificationAttentionTotal.
 * Chat hubs / Bottom = room ID sets only.
 */
export async function buildDomainBadgeAuthorityHttpPayload(
  sb: SupabaseClient,
  userId: string
): Promise<DomainBadgeAuthorityHttpPayload> {
  const uid = userId.trim();
  const projectionVersionMs = Date.now();

  const [messengerRooms, tradeStoreRooms, missed, categoryCounts, bellExplainRows, ownerO] =
    await Promise.all([
      loadMessengerUnreadRoomFactsFromParticipants(sb, uid),
      loadTradeStoreOrderUnreadRoomFactsFromParticipants(sb, uid),
      loadOrphanMissedCallFacts(sb, uid),
      countNotificationEventsBadge(sb, uid),
      loadBellExplainUnreadEventRows(sb, uid),
      loadOwnerOperationOFacts(sb, uid),
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

  const unifiedAttention = buildUnifiedAppIconProjection({
    chat: {
      generalRoomIds: messengerRooms.generalDirectUnreadRoomIds,
      groupRoomIds: messengerRooms.groupUnreadRoomIds,
      tradeRoomIds: tradeStoreRooms.tradeUnreadRoomIds,
      customerOrderRoomIds: tradeStoreRooms.customerOrderUnreadRoomIds,
      ownerOrderRoomIds: tradeStoreRooms.ownerOrderUnreadRoomIds,
    },
    notificationEvents: bellExplainRows,
  });
  const notificationAttentionTotal = unifiedAttention.notification.total;
  /** N = A_member. Bell digit = N only (owner ops → FAB). */
  const memberUnreadNotificationCount = deriveMemberUnreadNotificationCount(
    bellExplainRows,
    uid
  );
  const ownerOperationBellCount = ownerO.ownerOperationBellCount;
  /** O kept for FAB / diagnostics — Icon∪O undecided (not in App Icon total). */
  const ownerOperationCount = ownerO.ownerOperationCount;

  const projection: NotificationBadgeProjection = buildNotificationBadgeProjection({
    domainUnreadRooms,
    storeOrderBuyerDeliveryUnread,
    storeOrderOwnerChatUnread,
    storeOrderOwnerUnreadByStoreId: tradeStoreRooms.ownerOrderUnreadByStoreId,
    orphanMissedCall: missed.orphan,
    nonChatEventAttention,
    notificationAttentionTotal,
    memberUnreadNotificationCount,
    ownerOperationBellCount,
    unresolvedMissedCallIds: missed.orphanCallIds,
    unreadApprovedNotificationEvents,
    bell: categoryCounts,
    rowUnreadByRoomId: {
      ...missed.byRoom,
      ...messengerRooms.rowUnreadByRoomId,
      ...tradeStoreRooms.rowUnreadByRoomId,
    },
  });

  // Gate 3 Step 12 — no *:room:{uuid} invent. Incomplete → quarantine (excluded from B).
  const conversationNormalized = conversationRoomsFromParticipantFactsNormalized({
    memberId: uid,
    generalDirect: messengerRooms.generalDirectUnreadRoomIds.map((roomId) => ({
      roomId,
      unreadMessageCount: messengerRooms.rowUnreadByRoomId[roomId] ?? 1,
      domainIdentityKey: messengerRooms.domainIdentityKeyByRoomId[roomId],
      peerUserId: messengerRooms.peerUserIdByRoomId[roomId],
    })),
    group: messengerRooms.groupUnreadRoomIds.map((roomId) => ({
      roomId,
      unreadMessageCount: messengerRooms.rowUnreadByRoomId[roomId] ?? 1,
      domainIdentityKey: messengerRooms.domainIdentityKeyByRoomId[roomId],
      groupId: roomId,
    })),
    trade: tradeStoreRooms.tradeUnreadRoomIds.map((roomId) => ({
      roomId,
      unreadMessageCount: tradeStoreRooms.rowUnreadByRoomId[roomId] ?? 1,
      domainIdentityKey: tradeStoreRooms.domainIdentityKeyByRoomId[roomId],
    })),
    customerOrder: tradeStoreRooms.customerOrderUnreadRoomIds.map((roomId) => {
      const key = tradeStoreRooms.domainIdentityKeyByRoomId[roomId];
      const orderId =
        key && key.startsWith("store_order:") && !key.startsWith("store_order:room:")
          ? key.slice("store_order:".length).split(":")[0]?.trim()
          : undefined;
      return {
        roomId,
        unreadMessageCount: tradeStoreRooms.rowUnreadByRoomId[roomId] ?? 1,
        domainIdentityKey: key,
        orderId: orderId || undefined,
      };
    }),
    ownerOrder: tradeStoreRooms.ownerOrderUnreadRoomIds.map((roomId) => ({
      roomId,
      unreadMessageCount: tradeStoreRooms.rowUnreadByRoomId[roomId] ?? 1,
    })),
  });
  const memberConversationAuthority = resolveMemberConversationAuthority(
    uid,
    conversationNormalized.rooms
  );
  const conversationSurfaces = projectSurfacesFromConversationAuthority(
    memberConversationAuthority
  );
  const notificationA = resolveMemberNotificationAuthorityFromRows(bellExplainRows, uid);
  const memberAppIconAuthority = resolveMemberAppIconAuthority({
    notificationA,
    conversationB: memberConversationAuthority,
    /** Icon = Bell + Bottom rooms; O undecided — do not add until product lock. */
    ownerOperationCount: 0,
    revision: projectionVersionMs,
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
    notificationAttentionTotal,
    notificationAttentionKeys: unifiedAttention.notification.attentionKeys,
  });
  const bellExplainMatrix = buildBellExplainMatrix(bellExplainRows);

  logNotifyBadge("server_count", {
    userId: uid,
    authority: "domain_badge",
    bellTotal: projection.bellTotal,
    appIconTotal: memberAppIconAuthority.appIconTotal,
    chatAttention: unifiedAttention.chat.total,
    notificationAttention: notificationAttentionTotal,
    ownerOperationCount,
    ownerOperationBellCount,
    bottomChat: projection.bottomChat,
    ...domainUnreadRooms,
    messenger_gd_rooms: messengerRooms.generalDirectUnreadRoomIds.length,
    messenger_group_rooms: messengerRooms.groupUnreadRoomIds.length,
    trade_rooms: tradeStoreRooms.tradeUnreadRoomIds.length,
    so_customer_rooms: tradeStoreRooms.customerOrderUnreadRoomIds.length,
    so_owner_rooms: tradeStoreRooms.ownerOrderUnreadRoomIds.length,
    explain_app_icon: explainMatrix.appIcon.total,
    explain_bell: bellExplainMatrix.total,
    unified_app_icon: unifiedAttention.appIconTotal,
    excluded_chat_events: unifiedAttention.notification.excludedChatMessageEventIds.length,
    p2_messenger_participant_select: 1,
    p2_trade_so_participant_select: 1,
    p2_orphan_select: 1,
    p3_bell_explain_select: 1,
    identity_incomplete_count: conversationNormalized.identityIncompleteCount,
    identity_quarantined: conversationNormalized.quarantined.length,
  });

  return {
    ok: true,
    authority: "domain_badge",
    projectionVersionMs,
    projection: {
      bellTotal: projection.bellTotal,
      /** Gate 3 Step 6 — canonical A + B (not orphan re-add). */
      appIconTotal: memberAppIconAuthority.appIconTotal,
      bottomChatTotal: conversationSurfaces.bottomChat,
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
    unifiedAttention,
    domainAppIcon: {
      messenger: projection.appIcon.messenger,
      trade: projection.appIcon.trade,
      storeOrder: projection.appIcon.storeOrder,
      missedCall: projection.appIcon.missedCall,
    },
    storeOrderBuyerDeliveryUnread,
    storeOrderOwnerChatUnread,
    unreadApprovedNotificationEvents,
    notificationAttentionTotal,
    memberUnreadNotificationCount,
    ownerOperationCount,
    ownerOperationBellCount,
    /** Slice 2-3 — top-level orphan Fact for client Apply B_missed. */
    orphanMissedCallCount: missed.orphan,
    unresolvedMissedCallIds: missed.orphanCallIds,
    memberUnreadRoomCount: memberConversationAuthority.totalUnreadRooms,
    memberUnresolvedMissedCallCount: projection.memberUnresolvedMissedCallCount,
    memberAppIconWebTotal: memberAppIconAuthority.appIconTotal,
    memberConversationAuthority,
    memberConversationUnreadRooms: memberConversationAuthority.totalUnreadRooms,
    memberAppIconAuthority,
    nonChatEventAttention,
    missedCallByRoom: missed.byRoom,
    /** Product Bell digit = A_member (N) only. */
    total: projection.bellTotal,
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
