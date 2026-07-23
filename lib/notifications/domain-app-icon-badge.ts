/**
 * Domain App Icon Badge Authority — single formula for native app icon count.
 *
 * App Icon = messenger (GD+Group rooms) + trade rooms + store_order rooms
 *          + orphan missedCall only (room_id null).
 * Room-attached missed_call counts via Room → Hub → App Icon room path — DO NOT re-add.
 * DO NOT add notification_events category SUM (adminNotice, trade_status, order_status, …)
 * — that double-counts Domain room unread.
 *
 * Lives under lib/notifications so app/api badge-count may import without crossing
 * the app → lib/messenger port boundary (Phase 4.5 contract).
 */

export type DomainAppIconBadgeParts = Readonly<{
  messenger: number;
  trade: number;
  storeOrder: number;
  /** Orphan missed_call events only (no room_id). */
  missedCall: number;
}>;

function nonNeg(n: unknown): number {
  return Math.max(0, Math.floor(Number(n) || 0));
}

/** Pure App Icon total from Domain shell + orphan missedCall only. */
export function resolveDomainAppIconBadgeCount(parts: DomainAppIconBadgeParts): number {
  return (
    nonNeg(parts.messenger) +
    nonNeg(parts.trade) +
    nonNeg(parts.storeOrder) +
    nonNeg(parts.missedCall)
  );
}

export function resolveDomainAppIconBadgeParts(input: {
  communityMessengerUnread: number;
  tradeUnread: number;
  storeOrderChatUnread: number;
  missedCall?: number;
}): DomainAppIconBadgeParts {
  return {
    messenger: nonNeg(input.communityMessengerUnread),
    trade: nonNeg(input.tradeUnread),
    storeOrder: nonNeg(input.storeOrderChatUnread),
    missedCall: nonNeg(input.missedCall),
  };
}
