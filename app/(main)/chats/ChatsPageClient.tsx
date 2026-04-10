"use client";

import { ChatRoomList } from "@/components/chats/ChatRoomList";
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";

export function ChatsPageClient() {
  return (
    <div className="space-y-2 pb-24">
      <ChatRoomList
        segment="trade"
        getRoomHref={(roomId, room) => tradeHubChatRoomHref(roomId, room.source)}
      />
    </div>
  );
}
