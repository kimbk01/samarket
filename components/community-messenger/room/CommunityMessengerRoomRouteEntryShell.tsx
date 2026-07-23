"use client";

import { memo } from "react";
import { CommunityMessengerRoomEntryEmpty } from "@/components/community-messenger/room/CommunityMessengerRoomEntryEmpty";

/** Chunk/Suspense wait — empty bg only (no seed header). */
export const CommunityMessengerRoomRouteEntryShell = memo(function CommunityMessengerRoomRouteEntryShell({
  roomId,
  recordShellPaint = true,
}: {
  roomId?: string;
  recordShellPaint?: boolean;
}) {
  return (
    <CommunityMessengerRoomEntryEmpty
      roomId={roomId}
      recordShellPaint={recordShellPaint}
      recordSegmentFallback
      dataAttrs={{ "data-cm-room-route-entry-shell": "" }}
    />
  );
});
