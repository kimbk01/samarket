/**
 * Notification/Badge Projection — pure Builder contract (exactly one implementation).
 *
 * LOCK:
 * - Domains produce Facts; Authority never creates Facts or recomputes domain unread.
 * - Builder is pure: same ProjectionInput → same Projection; no DB; no Surface writes.
 * - All inputs (Cold Start / Bootstrap / Hub / Push / Realtime / Resume / Poll /
 *   Broadcast / Atomic Read) normalize to ProjectionInput then call this Builder only.
 *
 * Bell (product):
 *   bellTotal = A_member event count only (chat messages · owner ops excluded)
 *   Fallback (legacy callers): NotificationAttentionTotal
 *
 * Member App Icon (web/server):
 *   Bell + Bottom room set = A_member + (GD+Group+Trade+Customer)
 *   Orphan missed ∈ A only (never re-added as B_missed)
 *   Owner ops / owner rooms → FAB (Icon∪O undecided — not added here)
 *
 * Bottom Chat — GD + Group + Trade + Customer Order unread rooms.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  aggregateChatDomainBadgeShell,
  type ChatDomainBadgeShellResult,
} from "@/lib/chat-domain/shell/hub-badge-shell-aggregator";
import {
  resolveDomainAppIconBadgeCount,
  resolveDomainAppIconBadgeParts,
  type DomainAppIconBadgeParts,
} from "@/lib/notifications/domain-app-icon-badge";
import type { NotificationBadgeCount } from "@/lib/notifications/core/notification-event-types";
import { buildMemberCommunicationBProjection } from "@/lib/notifications/badge-authority-rebuild/member-communication-b-projection";

function nonNeg(n: unknown): number {
  return Math.max(0, Math.floor(Number(n) || 0));
}

/** Domain room unread Facts — produced by Domains / targets, never by Authority. */
export type NotificationBadgeDomainFacts = Readonly<Record<ChatDomain, number>>;

/**
 * Independent non-chat event attention Facts (inbox / status / notice).
 * Used for diagnostics / App Icon exclusion — NOT Bell total under Contract B.
 */
export type NotificationNonChatEventAttentionFacts = Readonly<{
  tradeStatus: number;
  orderStatus: number;
  deliveryStatus: number;
  communityActivity: number;
  adminNotice: number;
}>;

/**
 * Single Projection Input for every path.
 * Adapters only map path payloads → this shape; Builder call signature must not diverge.
 */
export type NotificationBadgeProjectionInput = Readonly<{
  domainUnreadRooms: NotificationBadgeDomainFacts;
  /** Fact: buyer/customer store_order attention (bottom_nav_delivery) — not recomputed. */
  storeOrderBuyerDeliveryUnread?: number;
  /**
   * Fact: owner store_order chat attention (fab_owner_order_chat / owner_order_chat rooms).
   * Hub owner aggregate (`storeOrderOwnerUnreadRooms`) — never buyer+owner sum.
   */
  storeOrderOwnerChatUnread?: number;
  /**
   * Optional per-store owner unread room counts (pass-through for store-scoped FAB).
   * Builder does not invent these — Fact producer only.
   */
  storeOrderOwnerUnreadByStoreId?: Readonly<Record<string, number>>;
  /** Fact: philife/community tab rooms (optional). */
  philifeChatUnread?: number;
  /** Fact: orphan missed_call events (room_id null) — diagnostics / list byRoom. */
  orphanMissedCall: number;
  /**
   * Fact: independent non-chat event attention breakdown (diagnostics).
   * Chat-domain message events must already be excluded by the Fact producer.
   */
  nonChatEventAttention: NotificationNonChatEventAttentionFacts;
  /**
   * Phase B — NotificationAttentionTotal (distinct non-chat attention_key).
   * Legacy App Icon notification axis when A_member omitted.
   * Slice 2-3 Member App Icon prefers A + B_missed when A is provided.
   */
  notificationAttentionTotal?: number;
  /**
   * N axis (A_member unread events). Product Bell digit = N only.
   * When omitted, falls back to `notificationAttentionTotal` (legacy Phase B parity).
   */
  memberUnreadNotificationCount?: number;
  /**
   * Owner ops (|O|) — FAB / delivery only. Not added to Bell digit.
   * Kept for diagnostics / callers that still load O facts.
   */
  ownerOperationBellCount?: number;
  /**
   * Slice 2-3E — optional call/session ids for unresolved missed dedupe.
   * When omitted, `orphanMissedCall` Fact is used.
   */
  unresolvedMissedCallIds?: readonly string[];
  /**
   * @deprecated Prefer `notificationAttentionTotal`. Legacy unread event row count (includes chat).
   */
  unreadApprovedNotificationEvents?: number;
  /**
   * Event category breakdown for inbox filters — `total` is Bell when
   * `unreadApprovedNotificationEvents` omitted.
   */
  bell?: NotificationBadgeCount;
  /** Fact: per-room list badge (message unread ± room-attached missed). Pass-through. */
  rowUnreadByRoomId?: Readonly<Record<string, number>>;
  /** Fact: OS tray identifiers to remove after read. Pass-through. */
  osNotificationRemove?: ReadonlyArray<{
    notificationId?: string | null;
    roomId?: string | null;
    domain?: string | null;
    domainIdentityKey?: string | null;
    eventId?: string | null;
  }>;
}>;

export type NotificationBadgeProjection = Readonly<{
  bottomChat: number;
  tradeHub: number;
  /**
   * @deprecated Prefer `storeOrderOwnerUnreadRooms`. Owner FAB aggregate from Builder.
   * Store-scoped FAB must use hub `storeOrderChatUnread` (targets + storeId), not this alone.
   */
  storeOrderHub: number;
  /** Customer order-chat messenger pillar — buyer_order room count only. */
  storeOrderCustomerUnread: number;
  /** Explicit alias — customer unread rooms. */
  storeOrderCustomerUnreadRooms: number;
  /** Explicit alias — owner unread rooms (all stores aggregate). */
  storeOrderOwnerUnreadRooms: number;
  /** Pass-through store-scoped owner unread. */
  storeOrderOwnerUnreadByStoreId: Readonly<Record<string, number>>;
  socialChatUnread: number;
  shell: ChatDomainBadgeShellResult;
  appIcon: DomainAppIconBadgeParts;
  appIconTotal: number;
  /** Slice 2-3 — Member B room count (owner store_order excluded). */
  memberUnreadRoomCount: number;
  /** Slice 2-3 — unresolved missed (call_id / orphan Fact). */
  memberUnresolvedMissedCallCount: number;
  /** Slice 2-3 — A + B_member web/server total (same as appIconTotal when A provided). */
  memberAppIconWebTotal: number;
  /**
   * Diagnostic: domain unread rooms + orphan (NOT product Bell under Contract B).
   */
  bellChatAttentionCount: number;
  /** Diagnostic: non-chat event attention sum (NOT product Bell alone). */
  bellNonChatEventCount: number;
  /** Product Bell live total = NotificationAttentionTotal. */
  bellTotal: number;
  /**
   * Bell snapshot for Surface store — `total` is Projection bellTotal (NotificationAttention).
   * Category fields from approved events for inbox UI filters (may include chat for diagnostics).
   */
  bell: NotificationBadgeCount;
  generalDirectUnreadRooms: number;
  groupUnreadRooms: number;
  tradeUnreadRooms: number;
  /**
   * @deprecated Prefer customer+owner split fields. Combined owner+buyer for diagnostics.
   */
  storeOrderUnreadRooms: number;
  rowUnreadByRoomId: Readonly<Record<string, number>>;
  osNotificationRemove: ReadonlyArray<{
    notificationId?: string | null;
    roomId?: string | null;
    domain?: string | null;
    domainIdentityKey?: string | null;
    eventId?: string | null;
  }>;
}>;

export const EMPTY_NON_CHAT_EVENT_ATTENTION: NotificationNonChatEventAttentionFacts = {
  tradeStatus: 0,
  orderStatus: 0,
  deliveryStatus: 0,
  communityActivity: 0,
  adminNotice: 0,
};

/** Empty Bell fact — adapters use when events not yet available. */
export const EMPTY_BELL_BADGE_FACTS: NotificationBadgeCount = {
  total: 0,
  chatMessage: 0,
  groupMessage: 0,
  tradeMessage: 0,
  tradeStatus: 0,
  orderStatus: 0,
  deliveryStatus: 0,
  communityActivity: 0,
  adminMarketingBanner: 0,
  adminNotice: 0,
  chat: 0,
  group: 0,
  trade: 0,
  store: 0,
  missedCall: 0,
};

export function sumNonChatEventAttention(
  facts: NotificationNonChatEventAttentionFacts | null | undefined
): number {
  if (!facts) return 0;
  return (
    nonNeg(facts.tradeStatus) +
    nonNeg(facts.orderStatus) +
    nonNeg(facts.deliveryStatus) +
    nonNeg(facts.communityActivity) +
    nonNeg(facts.adminNotice)
  );
}

function sumApprovedEventCategories(bell: NotificationBadgeCount): number {
  return (
    nonNeg(bell.chatMessage) +
    nonNeg(bell.groupMessage) +
    nonNeg(bell.tradeMessage) +
    nonNeg(bell.tradeStatus) +
    nonNeg(bell.orderStatus) +
    nonNeg(bell.deliveryStatus) +
    nonNeg(bell.communityActivity) +
    nonNeg(bell.adminNotice) +
    nonNeg(bell.missedCall)
  );
}

/**
 * THE Notification/Badge Projection Builder — pure, single implementation.
 */
export function buildNotificationBadgeProjection(
  input: NotificationBadgeProjectionInput
): NotificationBadgeProjection {
  const gd = nonNeg(input.domainUnreadRooms.general_direct);
  const group = nonNeg(input.domainUnreadRooms.group);
  const trade = nonNeg(input.domainUnreadRooms.trade);
  const storeOrderCombined = nonNeg(input.domainUnreadRooms.store_order);
  const buyer = nonNeg(input.storeOrderBuyerDeliveryUnread);
  const orphan = nonNeg(input.orphanMissedCall);
  const nonChatFacts = input.nonChatEventAttention ?? EMPTY_NON_CHAT_EVENT_ATTENTION;
  const nonChat = sumNonChatEventAttention(nonChatFacts);

  /**
   * Owner hub aggregate — never buyer+owner sum.
   * Prefer explicit owner Fact; else legacy: domain store_order when buyer Fact absent.
   */
  const ownerForHub =
    input.storeOrderOwnerChatUnread != null
      ? nonNeg(input.storeOrderOwnerChatUnread)
      : buyer > 0
        ? Math.max(0, storeOrderCombined - buyer)
        : storeOrderCombined;

  const shell = aggregateChatDomainBadgeShell(
    {
      general_direct: gd,
      group,
      trade,
      store_order: ownerForHub,
    },
    nonNeg(input.philifeChatUnread)
  );
  /**
   * Slice 2-3 — Member App Icon store_order axis = customer/buyer rooms ONLY.
   * Owner rooms stay on storeOrderOwnerUnreadRooms / Owner FAB (B_store — Slice 2-4).
   */
  const storeOrderForAppIcon = buyer;
  const memberB = buildMemberCommunicationBProjection({
    generalDirectUnreadRooms: gd,
    groupUnreadRooms: group,
    tradeUnreadRooms: trade,
    customerStoreOrderUnreadRooms: buyer,
    callIds: input.unresolvedMissedCallIds,
    orphanMissedCallCount: orphan,
  });
  /**
   * Phase B NotificationAttentionTotal — retained for diagnostics / legacy callers.
   * Fallback to orphan-only only when notificationAttentionTotal omitted.
   */
  const notificationAttentionTotal =
    input.notificationAttentionTotal != null
      ? nonNeg(input.notificationAttentionTotal)
      : orphan;
  /**
   * Gate 3 Step 6 Member App Icon notification wire:
   *   when A provided → A_member only (orphan already inside A; rooms on B axes)
   *   else legacy → notificationAttentionTotal (Phase B diagnostics)
   * DO NOT add memberUnresolvedMissedCallCount again (double-count ban).
   */
  const aMember =
    input.memberUnreadNotificationCount != null
      ? nonNeg(input.memberUnreadNotificationCount)
      : null;
  const appIconNotificationAxis =
    aMember != null ? aMember : notificationAttentionTotal;
  const appIcon = resolveDomainAppIconBadgeParts({
    communityMessengerUnread: shell.communityMessengerUnread,
    tradeUnread: shell.tradeUnread,
    storeOrderChatUnread: storeOrderForAppIcon,
    notificationAttention: appIconNotificationAxis,
  });
  const appIconTotal = resolveDomainAppIconBadgeCount(appIcon);
  /** Canonical Member App Icon = A + B_rooms (not rooms+orphan). */
  const memberAppIconWebTotal =
    aMember != null
      ? aMember + memberB.memberUnreadRoomCount
      : appIconTotal;

  /** Diagnostic only — NOT product Bell digit. Includes owner rooms. */
  const storeOrderCombinedForDiag =
    input.storeOrderOwnerChatUnread != null || buyer > 0
      ? ownerForHub + buyer
      : storeOrderCombined;
  const bellChatAttentionCount = gd + group + trade + storeOrderCombinedForDiag + orphan;
  const bellNonChatEventCount = nonChat;

  const eventBell = input.bell ?? EMPTY_BELL_BADGE_FACTS;
  const _unreadApprovedNotificationEvents =
    input.unreadApprovedNotificationEvents != null
      ? nonNeg(input.unreadApprovedNotificationEvents)
      : input.bell
        ? nonNeg(eventBell.total) || sumApprovedEventCategories(eventBell)
        : 0;
  void _unreadApprovedNotificationEvents;
  /**
   * Product Bell digit = A_member (N) only — chat · owner ops excluded.
   */
  const nOnly =
    input.memberUnreadNotificationCount != null
      ? nonNeg(input.memberUnreadNotificationCount)
      : notificationAttentionTotal;
  void nonNeg(input.ownerOperationBellCount);
  const bellTotal = nOnly;

  const bell: NotificationBadgeCount = {
    ...eventBell,
    total: bellTotal,
  };

  const byStore = input.storeOrderOwnerUnreadByStoreId ?? {};
  /** Bottom Chat = 일반+그룹+거래+주문(고객) room count. */
  const bottomChat = gd + group + trade + buyer;

  return {
    bottomChat,
    tradeHub: shell.tradeUnread,
    storeOrderHub: shell.storeOrderChatUnread,
    storeOrderCustomerUnread: buyer,
    storeOrderCustomerUnreadRooms: buyer,
    storeOrderOwnerUnreadRooms: ownerForHub,
    storeOrderOwnerUnreadByStoreId: byStore,
    socialChatUnread: shell.socialChatUnread,
    shell,
    appIcon,
    appIconTotal,
    memberUnreadRoomCount: memberB.memberUnreadRoomCount,
    memberUnresolvedMissedCallCount: memberB.memberUnresolvedMissedCallCount,
    memberAppIconWebTotal,
    bellChatAttentionCount,
    bellNonChatEventCount,
    bellTotal,
    bell,
    generalDirectUnreadRooms: gd,
    groupUnreadRooms: group,
    tradeUnreadRooms: trade,
    storeOrderUnreadRooms: storeOrderCombinedForDiag,
    rowUnreadByRoomId: input.rowUnreadByRoomId ?? {},
    osNotificationRemove: input.osNotificationRemove ?? [],
  };
}
