"use client";

import { ChatRoomScreen } from "@/components/chats/ChatRoomScreen";
import type { ChatMessage, ChatRoom, ChatRoomSource } from "@/lib/types/chat";

export function ChatRoomPageClient({
  roomId,
  openReviewOnMount,
  listHref,
  initialViewerUserId,
  chatRoomSourceHint = null,
  serverBootstrap = null,
}: {
  roomId: string | null;
  openReviewOnMount: boolean;
  listHref: string;
  initialViewerUserId: string | null;
  chatRoomSourceHint?: ChatRoomSource | null;
  serverBootstrap?: { room: ChatRoom; messages: ChatMessage[] } | null;
}) {
  return (
    <ChatRoomScreen
      roomId={roomId}
      openReviewOnMount={openReviewOnMount}
      listHref={listHref}
      initialViewerUserId={initialViewerUserId}
      chatRoomSourceHint={chatRoomSourceHint}
      serverBootstrap={serverBootstrap}
    />
  );
}
