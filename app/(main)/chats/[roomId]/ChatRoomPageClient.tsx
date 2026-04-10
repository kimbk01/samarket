"use client";

import { ChatRoomScreen } from "@/components/chats/ChatRoomScreen";
import type { ChatRoomSource } from "@/lib/types/chat";

export function ChatRoomPageClient({
  roomId,
  openReviewOnMount,
  listHref,
  initialViewerUserId,
  chatRoomSourceHint = null,
}: {
  roomId: string | null;
  openReviewOnMount: boolean;
  listHref: string;
  initialViewerUserId: string | null;
  chatRoomSourceHint?: ChatRoomSource | null;
}) {
  return (
    <ChatRoomScreen
      roomId={roomId}
      openReviewOnMount={openReviewOnMount}
      listHref={listHref}
      initialViewerUserId={initialViewerUserId}
      chatRoomSourceHint={chatRoomSourceHint}
    />
  );
}
