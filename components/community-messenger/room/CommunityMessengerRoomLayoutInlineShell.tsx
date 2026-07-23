"use client";

import { useParams } from "next/navigation";
import { CommunityMessengerRoomEntryEmpty } from "@/components/community-messenger/room/CommunityMessengerRoomEntryEmpty";

/** Kept for imports; layout no longer mounts a behind-shell. Empty only. */
export function CommunityMessengerRoomLayoutInlineShell() {
  const roomId = String(useParams()?.roomId ?? "").trim();
  return (
    <CommunityMessengerRoomEntryEmpty
      roomId={roomId}
      recordShellPaint={false}
      dataAttrs={{
        "data-cm-room-route-entry-shell": "",
        "data-cm-room-layout-inline-shell": "",
      }}
    />
  );
}
