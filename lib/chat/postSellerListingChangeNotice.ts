/**
 * 채팅 상단에서 판매자가 물품 상태를 바꾼 뒤에만 호출 —
 * 구매자·판매자 동일 채팅 스레드에 system 메시지 1건 기록
 */
import type { ChatMessage, ChatRoom } from "@/lib/types/chat";

/**
 * 시스템 안내 본문 — 문장 1줄만 저장한다 (SYS-01, 2026-10-27).
 * 시각은 메시지 `created_at` 을 기기 시간대로 표시한다 — 서버(UTC)에서 문자열로 박으면
 * PHT 사용자에게 8시간 틀린 시각이 보인다.
 */
export function formatSellerListingChangeNoticeBody(label: string): string {
  return `제품의 상태가 ${label}으로 변경되었습니다.`;
}

export async function postSellerListingChangeSystemNotice(
  room: ChatRoom,
  userId: string,
  bodyText: string
): Promise<ChatMessage | null> {
  const isChatRoom = room.source === "chat_room";
  try {
    if (isChatRoom) {
      const res = await fetch(`/api/chat/rooms/${room.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: bodyText, messageType: "system" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: { id: string; createdAt?: string };
      };
      if (!res.ok || !data.ok || !data.message?.id) return null;
      return {
        id: data.message.id,
        roomId: room.id,
        senderId: userId,
        message: bodyText,
        messageType: "system",
        createdAt: data.message.createdAt ?? new Date().toISOString(),
        isRead: true,
      };
    }
    const res = await fetch(`/api/chat/room/${room.id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: bodyText, messageType: "system" }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      messageId?: string;
      createdAt?: string;
    };
    if (!res.ok || !data.ok || !data.messageId) return null;
    return {
      id: data.messageId,
      roomId: room.id,
      senderId: userId,
      message: bodyText,
      messageType: "system",
      createdAt: data.createdAt ?? new Date().toISOString(),
      isRead: true,
    };
  } catch {
    return null;
  }
}
