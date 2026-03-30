"use client";

import { ChatRoomList } from "@/components/chats/ChatRoomList";

/** `/mypage/trade`용 — Server Component에서 함수 prop을 넘길 수 없어 클라이언트 경계 안에서만 정의 */
export function MypageTradeHubChatList({
  onSelectRoom,
}: {
  /** 홈 거래 채팅 시트 등 — 목록에서 방만 열 때(전체 페이지 이동 없음) */
  onSelectRoom?: (roomId: string) => void;
} = {}) {
  return (
    <ChatRoomList
      segment="trade"
      getRoomHref={
        onSelectRoom ? undefined : (roomId) => `/mypage/trade/chat/${encodeURIComponent(roomId)}`
      }
      onSelectRoom={onSelectRoom}
    />
  );
}
