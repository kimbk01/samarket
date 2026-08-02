/**
 * Domain App Icon Badge parts — memberAppIconTotal wire.
 *
 * memberAppIconTotal =
 *   messenger(GD+Group) + trade + customerOrderRooms + (memberA + orphanMissed)
 *
 * Owner rooms / store ops NEVER enter these parts.
 * `missedCall` field name retained for surface-store wire; value = memberA + orphan.
 */
export type DomainAppIconBadgeParts = Readonly<{
  messenger: number;
  trade: number;
  storeOrder: number;
  /**
   * NotificationAttentionTotal (distinct non-chat attention_key).
   * Field name `missedCall` kept for DomainBadgeSurfaceSnapshot compatibility.
   */
  missedCall: number;
}>;

function nonNeg(n: unknown): number {
  return Math.max(0, Math.floor(Number(n) || 0));
}

/** Pure App Icon total = chat rooms + notification attention. */
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
  /** NotificationAttentionTotal */
  missedCall?: number;
  notificationAttention?: number;
}): DomainAppIconBadgeParts {
  const notification = nonNeg(
    input.notificationAttention != null ? input.notificationAttention : input.missedCall
  );
  return {
    messenger: nonNeg(input.communityMessengerUnread),
    trade: nonNeg(input.tradeUnread),
    storeOrder: nonNeg(input.storeOrderChatUnread),
    missedCall: notification,
  };
}
