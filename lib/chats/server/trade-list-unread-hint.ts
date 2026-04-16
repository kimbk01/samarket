/**
 * 채팅 목록용 item_trade 미읽음 힌트 — N번 count 쿼리 없이 배지만 맞춘다.
 * 정확한 건수는 방 상세 `computeItemTradeUnreadCount` 에서만 계산한다.
 */
export function tradeListUnreadHintFromCursor(args: {
  viewerUserId: string;
  lastMessageId: string | null | undefined;
  lastMessageSenderId: string | null | undefined;
  lastReadMessageId: string | null | undefined;
}): number {
  const lm = (args.lastMessageId ?? "").trim();
  if (!lm) return 0;
  if ((args.lastMessageSenderId ?? "").trim() === args.viewerUserId.trim()) return 0;
  const lr = (args.lastReadMessageId ?? "").trim();
  if (lr === lm) return 0;
  return 1;
}
