/**
 * Server Domain Badge Authority for GET /api/me/notifications/badge-count.
 *
 * Final Stabilization Formula SSOT:
 *   Conversation B = unread room ID sets (GD+Group+Trade+Customer; Owner excluded)
 *   Notification A = unread eligible member notification events
 *   MemberAppIconTotal = A + B
 *
 * Slice 2-2 Bell digit:
 *   memberUnreadNotificationCount = A_member only
 *   (owner_intake / chat / room-bound missed excluded; persistent marketing included)
 *
 * categoryCounts remain inbox filter / diagnostics (may include chat rows).
 *
 * P2-a/b LOCK (IO only):
 * - Messenger / Trade / store_order rooms: community_messenger_participants.unread_count.
 * - Orphan missed: thin SELECT → A only; room-bound missed belongs to B.
 * - DO NOT reopen RoomUnread writers from this module.
 *
 * 2026-11-22 읽음 3단계 — Owner 「LOCK 재개봉·구현 승인」으로 **입력 읽기만** 바꿈(`get_member_badge_facts` 1번).
 * 계산식·응답 필드는 그대로. 설계: docs/audit/supabase-request-surge-2026-11-18/read-mark-stage3-badge-facts-design-2026-11-22.md
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
import { resolveMemberBadgeCounterShadowRate } from "@/lib/notifications/pipeline/badge-shadow-rate";
import {
  loadMemberUnreadRoomInputs,
  memberUnreadRoomInputsToLoaderInput,
} from "@/lib/notifications/member-unread-room-inputs";
import {
  buildBadgeExplainMatrix,
  type BadgeExplainMatrix,
} from "@/lib/notifications/badge-explain-matrix";
import {
  buildBellExplainMatrix,
  type BellExplainMatrix,
} from "@/lib/notifications/bell-explain-matrix";
import {
  buildNotificationAttentionProjection,
} from "@/lib/notifications/chat-notification-attention-projection";
import { MEMBER_NOTIFICATION_A_LOAD_LIMIT } from "@/lib/notifications/badge-authority-rebuild/load-member-notification-a-authority";
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
import { loadMemberBadgeFacts } from "@/lib/notifications/badge-authority-rebuild/load-member-badge-facts";
import { deriveBellBadgeFactsFromRows } from "@/lib/notifications/derive-bell-badge-facts-from-rows";
import { loadMessengerUnreadRoomFactsFromParticipants } from "@/lib/notifications/load-messenger-unread-room-facts-from-participants";
import { loadOrphanMissedCallFacts } from "@/lib/notifications/load-orphan-missed-call-facts";
import { loadTradeStoreOrderUnreadRoomFactsFromParticipants } from "@/lib/notifications/load-trade-store-order-unread-room-facts-from-participants";
import { loadUnreadParticipantRoomRows } from "@/lib/notifications/load-unread-participant-room-rows";

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
   * Digit SSOT = canonical Member Notification A (not chat event SUM).
   */
  bellExplainMatrix: BellExplainMatrix;
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
  /** @deprecated Raw eligible event row count (includes chat). Prefer memberUnreadNotificationCount. */
  unreadApprovedNotificationEvents: number;
  /** Legacy diagnostic attention total; product Bell is memberUnreadNotificationCount. */
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
 * Collect Domain Facts → canonical A/B Formula → Builder → HTTP payload.
 * Bell digit / App Icon notification axis = Member Notification A.
 * Chat hubs / Bottom = room ID sets only.
 */
export async function buildDomainBadgeAuthorityHttpPayload(
  sb: SupabaseClient,
  userId: string
): Promise<DomainBadgeAuthorityHttpPayload> {
  const uid = userId.trim();
  const projectionVersionMs = Date.now();

  /**
   * D2 2-c (2026-11-19) — 안 읽은 방 입력을 쓰기 시점 표(`member_unread_room_inputs`) 1회로 읽고 **같은 로더·같은 판정 함수**에 넣는다.
   * (이전: participants·rooms·store_orders·stores 4~5회.) 표 읽기 실패면 이전 경로 그대로.
   * 결과 동일 근거: 운영 실데이터 36/36 · 그림자 `[unread-inputs-shadow]`.
   */
  /**
   * 읽음 3단계 (2026-11-22 · Owner 「LOCK 재개봉·구현 승인」) — 아래 세 입력(안 읽은 방 입력·종 알림 행·소유 매장)을
   * DB 함수 1번으로 같은 조건·정렬·상한으로 받아 **같은 로더 자리에** 넣는다. null(함수 없음·오류) → 지금 3번 경로.
   */
  const badgeFactsP = loadMemberBadgeFacts(sb, uid, MEMBER_NOTIFICATION_A_LOAD_LIMIT);
  const unreadFactsP = (async () => {
    const facts = await badgeFactsP;
    const inputRows = facts ? facts.inputs : await loadMemberUnreadRoomInputs(sb, uid);
    if (inputRows) {
      const { loaded, orderMaps } = memberUnreadRoomInputsToLoaderInput(inputRows);
      const [m, t] = await Promise.all([
        loadMessengerUnreadRoomFactsFromParticipants(sb, uid, loaded),
        loadTradeStoreOrderUnreadRoomFactsFromParticipants(sb, uid, loaded, orderMaps),
      ]);
      return { messengerRooms: m, tradeStoreRooms: t, viaInputs: true as const, inputRowCount: inputRows.length };
    }
    /** S2 (2026-11-09): participants·rooms 를 1회만 읽어 메신저·거래/주문 로더가 나눠 쓴다(같은 조회 2건 중복 제거). */
    const unreadParticipantRoomRows = loadUnreadParticipantRoomRows(sb, uid);
    const [m, t] = await Promise.all([
      loadMessengerUnreadRoomFactsFromParticipants(sb, uid, unreadParticipantRoomRows),
      loadTradeStoreOrderUnreadRoomFactsFromParticipants(sb, uid, unreadParticipantRoomRows),
    ]);
    return { messengerRooms: m, tradeStoreRooms: t, viaInputs: false as const, inputRowCount: 0 };
  })();
  /**
   * D2 2-d-1 (2026-11-19) — 종 알림 행을 1번 읽고, 상한보다 적으면 부재중·분류 수를 같은 행에서 계산.
   * 상한에 닿으면 이전처럼 ①·② 를 따로 읽는다(`derive-bell-badge-facts-from-rows.ts`).
   */
  const bellFactsP = (async () => {
    const facts = await badgeFactsP;
    const rows = facts
      ? facts.bellRows
      : await loadBellExplainUnreadEventRows(sb, uid, { limit: MEMBER_NOTIFICATION_A_LOAD_LIMIT });
    const derived = deriveBellBadgeFactsFromRows(rows, MEMBER_NOTIFICATION_A_LOAD_LIMIT);
    if (derived) return { rows, ...derived, viaRows: true as const };
    const [m, c] = await Promise.all([
      loadOrphanMissedCallFacts(sb, uid),
      /** BRIDGE: category diagnostics only — NOT Member Bell digit. Exit when inbox UI drops categoryCounts.total. */
      countNotificationEventsBadge(sb, uid),
    ]);
    return { rows, missed: m, categoryCounts: c, viaRows: false as const };
  })();
  const [unreadFacts, bellFacts, ownerO] = await Promise.all([
    unreadFactsP,
    bellFactsP,
    badgeFactsP.then((facts) => loadOwnerOperationOFacts(sb, uid, facts ? facts.ownedStoreIds : null)),
  ]);
  const { missed, categoryCounts, rows: bellExplainRows } = bellFacts;

  /** 2026-11-22 그림자 퇴역 — `[bell-single-read-shadow]` 11-19~ 일치 249 · 불일치 0 (설계 shadow-retirement-design-2026-11-22.md) */
  const { messengerRooms, tradeStoreRooms } = unreadFacts;

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

  const notificationAttention = buildNotificationAttentionProjection(bellExplainRows);
  const notificationAttentionTotal = notificationAttention.total;
  /** Canonical Member Bell A — same loader limit as NC unread_total. */
  const notificationA = resolveMemberNotificationAuthorityFromRows(bellExplainRows, uid);
  const memberUnreadNotificationCount = notificationA.unreadCount;
  const ownerOperationBellCount = ownerO.ownerOperationBellCount;
  /** O kept for Owner FAB / diagnostics; excluded from Member Bell/App Icon. */
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
  const memberAppIconAuthority = resolveMemberAppIconAuthority({
    notificationA,
    conversationB: memberConversationAuthority,
    /** Member Icon = A + B; Owner O is excluded by product contract. */
    ownerOperationCount: 0,
    revision: projectionVersionMs,
  });

  /**
   * 하단 탭 수(L: 회원 B 합) ↔ 앱 아이콘 수(A) 갈림 감시 — Supabase 호출 없음 · 기록은 예전과 같은 표본 비율.
   * 2026-11-19 재감사 C: `member_badge_counters` 그림자 퇴역 때 이 감시만 남겼다(예전에는 그림자 표본 안에서만 기록).
   */
  {
    const loaderMemberB =
      domainUnreadRooms.general_direct + domainUnreadRooms.group + domainUnreadRooms.trade + storeOrderBuyerDeliveryUnread;
    if (
      loaderMemberB !== memberConversationAuthority.totalUnreadRooms &&
      Math.random() < resolveMemberBadgeCounterShadowRate()
    ) {
      console.warn("[badge-loader-authority-diverged]", {
        userIdTail: uid.slice(-8),
        loaderMemberB,
        authorityTotal: memberConversationAuthority.totalUnreadRooms,
      });
    }
  }

  /** 2026-11-22 그림자 퇴역 — `[unread-inputs-shadow]` 11-20 06:00 UTC 이후 일치 106 · 불일치 0 (설계 shadow-retirement-design-2026-11-22.md) */

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
    notificationAttentionTotal: memberUnreadNotificationCount,
    notificationAttentionKeys: notificationA.eventIds,
  });
  const bellExplainMatrix = buildBellExplainMatrix(bellExplainRows);

  logNotifyBadge("server_count", {
    userId: uid,
    authority: "domain_badge",
    bellTotal: projection.bellTotal,
    appIconTotal: memberAppIconAuthority.appIconTotal,
    chatAttention: memberConversationAuthority.totalUnreadRooms,
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
    canonical_app_icon: memberAppIconAuthority.appIconTotal,
    excluded_chat_events: notificationAttention.excludedChatMessageEventIds.length,
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
