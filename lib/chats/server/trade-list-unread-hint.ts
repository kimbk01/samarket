/**
 * 채팅 목록용 item_trade 미읽음 힌트 — N번 count 쿼리 없이 배지만 맞춘다.
 * 정확한 건수는 방 상세 `computeItemTradeUnreadCount` 에서만 계산한다.
 *
 * `last_message_id`가 `chat_messages`에 없으면(삭제·DB 불일치) 발신자를 알 수 없어
 * 예전에는 항상 “상대 메시지”로 간주해 **유령 미읽음 1**이 났다 — `lastMessageRowResolvable === false` 로 막는다.
 */
export function tradeListUnreadHintFromCursor(args: {
  viewerUserId: string;
  lastMessageId: string | null | undefined;
  lastMessageSenderId: string | null | undefined;
  lastReadMessageId: string | null | undefined;
  /** false: `last_message_id` 행을 조회하지 못함 → 미읽음 0 */
  lastMessageRowResolvable?: boolean;
}): number {
  const lm = (args.lastMessageId ?? "").trim();
  if (!lm) return 0;
  if (args.lastMessageRowResolvable === false) return 0;
  if ((args.lastMessageSenderId ?? "").trim() === args.viewerUserId.trim()) return 0;
  const lr = (args.lastReadMessageId ?? "").trim();
  if (lr === lm) return 0;
  return 1;
}
