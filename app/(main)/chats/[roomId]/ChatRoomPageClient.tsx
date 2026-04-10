"use client";

import { ChatRoomScreen } from "@/components/chats/ChatRoomScreen";

export function ChatRoomPageClient({
  roomId,
  openReviewOnMount,
  listHref,
  initialViewerUserId,
}: {
  roomId: string | null;
  openReviewOnMount: boolean;
  listHref: string;
  initialViewerUserId: string | null;
}) {
  return (
    <ChatRoomScreen
      roomId={roomId}
      openReviewOnMount={openReviewOnMount}
      listHref={listHref}
      initialViewerUserId={initialViewerUserId}
    />
  );
}
