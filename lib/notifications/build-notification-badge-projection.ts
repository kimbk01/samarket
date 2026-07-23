/**
 * Notification/Badge Projection — pure Builder contract (exactly one implementation).
 *
 * LOCK:
 * - Domains produce Facts; Authority never creates Facts or recomputes domain unread.
 * - Builder is pure: same ProjectionInput → same Projection; no DB; no Surface writes.
 * - All inputs (Cold Start / Bootstrap / Hub / Push / Realtime / Resume / Poll /
 *   Broadcast / Atomic Read) normalize to ProjectionInput then call this Builder only.
 *
 * Bell (product live badge) — NOT raw notification_events SUM:
 *   chatAttention = Σ domain unread rooms (GD+Group+Trade+StoreOrder) + orphan missed-call
 *   nonChatEventAttention = independent status/notice events only (no chat_message dupes)
 *   bellTotal = chatAttention + nonChatEventAttention
 *
 * App Icon — Domain Attention Projection only (no non-chat status/notice):
 *   messenger(GD+Group) + trade + storeOrder(+buyer) + orphan missed
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
 * Must NOT include chat_message / group_message / trade_message / store_order_message
 * (those are covered by domain unread rooms).
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
  /** Fact: philife/community tab rooms (optional). */
  philifeChatUnread?: number;
  /** Fact: orphan missed_call events (room_id null). */
  orphanMissedCall: number;
  /**
   * Fact: independent non-chat event attention breakdown.
   * Chat-domain message events must already be excluded by the Fact producer.
   */
  nonChatEventAttention: NotificationNonChatEventAttentionFacts;
  /**
   * @deprecated Raw events breakdown for inbox filters only — Builder does not use
   * `bell.total` as product Bell. Prefer `nonChatEventAttention`.
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
  storeOrderHub: number;
  socialChatUnread: number;
  shell: ChatDomainBadgeShellResult;
  appIcon: DomainAppIconBadgeParts;
  appIconTotal: number;
  /** Domain unread rooms + orphan missed (no non-chat status). */
  bellChatAttentionCount: number;
  /** Independent non-chat event attention (no chat message dupes). */
  bellNonChatEventCount: number;
  /** Product Bell live total = chatAttention + nonChatEventAttention. */
  bellTotal: number;
  /**
   * Bell snapshot for Surface store — `total` is Projection bellTotal (not events SUM).
   * Category fields carry non-chat + orphan missed for inbox UI filters.
   */
  bell: NotificationBadgeCount;
  generalDirectUnreadRooms: number;
  groupUnreadRooms: number;
  tradeUnreadRooms: number;
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
  const storeOrder = nonNeg(input.domainUnreadRooms.store_order);
  const orphan = nonNeg(input.orphanMissedCall);
  const nonChatFacts = input.nonChatEventAttention ?? EMPTY_NON_CHAT_EVENT_ATTENTION;
  const nonChat = sumNonChatEventAttention(nonChatFacts);

  const shell = aggregateChatDomainBadgeShell(
    {
      general_direct: gd,
      group,
      trade,
      store_order: storeOrder,
    },
    nonNeg(input.philifeChatUnread)
  );
  const storeOrderForAppIcon =
    shell.storeOrderChatUnread + nonNeg(input.storeOrderBuyerDeliveryUnread);
  const appIcon = resolveDomainAppIconBadgeParts({
    communityMessengerUnread: shell.communityMessengerUnread,
    tradeUnread: shell.tradeUnread,
    storeOrderChatUnread: storeOrderForAppIcon,
    missedCall: orphan,
  });

  /** Chat Attention = all four domain unread rooms + orphan missed (no event-row chat dupes). */
  const bellChatAttentionCount = gd + group + trade + storeOrder + orphan;
  const bellNonChatEventCount = nonChat;
  const bellTotal = bellChatAttentionCount + bellNonChatEventCount;

  const bell: NotificationBadgeCount = {
    total: bellTotal,
    chatMessage: gd,
    groupMessage: group,
    tradeMessage: trade,
    tradeStatus: nonNeg(nonChatFacts.tradeStatus),
    orderStatus: nonNeg(nonChatFacts.orderStatus),
    deliveryStatus: nonNeg(nonChatFacts.deliveryStatus),
    communityActivity: nonNeg(nonChatFacts.communityActivity),
    adminMarketingBanner: 0,
    adminNotice: nonNeg(nonChatFacts.adminNotice),
    chat: gd,
    group,
    trade,
    store: storeOrder,
    missedCall: orphan,
  };

  return {
    bottomChat: shell.communityMessengerUnread,
    tradeHub: shell.tradeUnread,
    storeOrderHub: shell.storeOrderChatUnread,
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
    storeOrderUnreadRooms: storeOrder,
    rowUnreadByRoomId: input.rowUnreadByRoomId ?? {},
    osNotificationRemove: input.osNotificationRemove ?? [],
  };
}
