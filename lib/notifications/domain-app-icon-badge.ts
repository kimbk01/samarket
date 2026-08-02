/**
 * Domain App Icon Badge Authority — unified Chat + Notification formula.
 *
 * Slice 2-3 Member App Icon (web/server via Builder):
 *   A_member + B_member rooms (GD+Group+Trade+Customer) + unresolved missed
 *   Owner store_order rooms excluded from storeOrder axis.
 *
 * Legacy Phase B (when A omitted):
 *   Chat room axes + NotificationAttentionTotal
 *
 * Room-bound missed_call → list row only (already covered if room unread) — DO NOT re-add.
 * chat_message events → Chat room axis only — DO NOT add via Bell/NotificationAttention.
 *
 * `missedCall` field name retained for surface-store wire compatibility;
 * Slice 2-3 with A provided: value = A_member + B_missed (not Phase B NotificationAttention alone).
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
