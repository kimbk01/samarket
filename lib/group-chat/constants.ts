/** [docs/group-chat-bootstrap.md](../docs/group-chat-bootstrap.md) 와 동일 */
export const GROUP_CHAT_BOOTSTRAP_MESSAGE_LIMIT = 50;
export const GROUP_CHAT_BOOTSTRAP_MEMBER_CAP = 20;

/**
 * 그룹 채팅 목록 = CM private_group 필터 (`app/(main)/group-chat/page.tsx` redirect 대상과 동일).
 * 방 ← ·오류 화면 「목록으로」는 `/group-chat` 을 거치지 않고 최종 목적지로 바로 간다 (T-09 이중 이동 제거).
 */
export const GROUP_CHAT_LIST_HREF = "/community-messenger?section=chats&filter=private_group";
