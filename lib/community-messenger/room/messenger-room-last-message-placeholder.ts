/**
 * CM room summary `lastMessage` — DB 빈 값일 때 목록·bootstrap UI placeholder.
 * bootstrap mount SSOT(`isAuthoritativeMessengerRoomEntrySnapshot`)에서는
 * **실제 메시지 힌트와 구분**해야 한다. placeholder 를 lastMessage-only incomplete 로 보면
 * 신규 1:1(친구 추가 직후) 방 진입이 `incomplete_timeline_seed` 로 막힌다.
 *
 * catalog: `cm_svc_last_msg_direct` · `cm_svc_last_msg_group` (ko/en)
 */

const MESSENGER_ROOM_LAST_MESSAGE_DISPLAY_PLACEHOLDERS = new Set([
  "메시지를 보내 보세요.",
  "그룹 대화를 시작해 보세요.",
  "Send a message to start chatting.",
  "Start a group conversation.",
]);

export function isMessengerRoomLastMessageDisplayPlaceholder(
  lastMessage: string | null | undefined
): boolean {
  const text = typeof lastMessage === "string" ? lastMessage.trim() : "";
  if (!text) return false;
  return MESSENGER_ROOM_LAST_MESSAGE_DISPLAY_PLACEHOLDERS.has(text);
}

/** paint·bootstrap seed 판정용 — placeholder 는 힌트 아님 */
export function hasMessengerRoomRealLastMessageHint(lastMessage: string | null | undefined): boolean {
  const text = typeof lastMessage === "string" ? lastMessage.trim() : "";
  if (!text) return false;
  return !isMessengerRoomLastMessageDisplayPlaceholder(text);
}
