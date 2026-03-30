"use client";

import { ChatRoomList } from "@/components/chats/ChatRoomList";

export function ChatsPageClient() {
  return (
    <div className="space-y-2 pb-24">
      <ChatRoomList
        segment="trade"
        getRoomHref={(roomId) => `/mypage/trade/chat/${encodeURIComponent(roomId)}`}
      />
    </div>
  );
}
