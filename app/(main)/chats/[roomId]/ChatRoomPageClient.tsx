"use client";

import { ChatRoomScreen } from "@/components/chats/ChatRoomScreen";

export function ChatRoomPageClient({
  roomId,
  openReviewOnMount,
  listHref,
}: {
  roomId: string | null;
  openReviewOnMount: boolean;
  listHref: string;
}) {
  return (
    <ChatRoomScreen
      roomId={roomId}
      openReviewOnMount={openReviewOnMount}
      listHref={listHref}
    />
  );
}
