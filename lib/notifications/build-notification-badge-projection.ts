/**
 * Notification/Badge Projection — pure Builder contract (exactly one implementation).
 *
 * LOCK:
 * - Domains produce Facts; Authority never creates Facts or recomputes domain unread.
 * - Builder is pure: same ProjectionInput → same Projection; no DB; no Surface writes.
 * - All inputs (Cold Start / Bootstrap / Hub / Push / Realtime / Resume / Poll /
 *   Broadcast / Atomic Read) normalize to ProjectionInput then call this Builder only.
 *
 * Bell (Slice 2a/2b):
 *   bellTotal = memberNotificationAttention (no store ops, no orphan missed)
 *
 * Member App Icon (APPROVED):
 *   memberNotification + GD+Group+Trade+Customer rooms + orphan missed
 *   Owner rooms / store ops → Store Identity surfaces only
 *
 * Bottom Chat — general_direct + group unread rooms only (UNCHANGED).
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
   * Member NotificationAttentionTotal (Bell digit).
   * Must already exclude store ops + orphan missed + chat_message.
   */
  notificationAttentionTotal?: number;
  /**
   * Orphan missed count for memberAppIconTotal (B axis).
   * When omitted, falls back to `orphanMissedCall` fact.
   */
  memberMissedCallCount?: number;
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
  /**
   * Diagnostic: domain unread rooms + orphan (NOT product Bell under Contract B).
   */
  bellChatAttentionCount: number;
  /** Diagnostic: non-chat event attention sum (NOT product Bell alone). */
  bellNonChatEventCount: number;
  /** Product Bell live total = memberNotificationAttention. */
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
  /** Member App Icon: customer order rooms only — never owner rooms. */
  const storeOrderForMemberAppIcon = buyer;
  /**
   * Member Bell digit. Fallback 0 when omitted (do not fall back to orphan — orphan is B).
   */
  const memberNotificationAttention =
    input.notificationAttentionTotal != null
      ? nonNeg(input.notificationAttentionTotal)
      : 0;
  const memberMissed =
    input.memberMissedCallCount != null ? nonNeg(input.memberMissedCallCount) : orphan;
  /** App Icon notification axis wire = member A + orphan missed (field name retained). */
  const appIconNotificationAxis = memberNotificationAttention + memberMissed;
  const appIcon = resolveDomainAppIconBadgeParts({
    communityMessengerUnread: shell.communityMessengerUnread,
    tradeUnread: shell.tradeUnread,
    storeOrderChatUnread: storeOrderForMemberAppIcon,
    notificationAttention: appIconNotificationAxis,
  });

  /** Diagnostic only — NOT product Bell digit. */
  const storeOrderCombinedForDiag =
    input.storeOrderOwnerChatUnread != null || buyer > 0
      ? ownerForHub + buyer
      : storeOrderCombined;
  const bellChatAttentionCount = gd + group + trade + storeOrderCombinedForDiag + orphan;
  const bellNonChatEventCount = nonChat;

  const eventBell = input.bell ?? EMPTY_BELL_BADGE_FACTS;
  /** Product Bell digit = member A only. */
  const bellTotal = memberNotificationAttention;

  const bell: NotificationBadgeCount = {
    ...eventBell,
    total: bellTotal,
  };

  const byStore = input.storeOrderOwnerUnreadByStoreId ?? {};

  return {
    bottomChat: shell.communityMessengerUnread,
    tradeHub: shell.tradeUnread,
    storeOrderHub: shell.storeOrderChatUnread,
    storeOrderCustomerUnread: buyer,
    storeOrderCustomerUnreadRooms: buyer,
    storeOrderOwnerUnreadRooms: ownerForHub,
    storeOrderOwnerUnreadByStoreId: byStore,
    socialChatUnread: shell.socialChatUnread,
    shell,
    appIcon,
    appIconTotal: resolveDomainAppIconBadgeCount(appIcon),
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
