"use client";

import { memo } from "react";
import { CommunityMessengerRoomStableEntryShell } from "@/components/community-messenger/room/CommunityMessengerRoomStableEntryShell";

type CommunityMessengerRoomPass1StableShellProps = {
  roomId: string;
  narrowViewport: boolean;
  composerEntryVisible: boolean;
};

/** BN13 — Pass0 skip·Phase2 body 대기 중 header+viewport skeleton+composer 자리 즉시 paint */
export const CommunityMessengerRoomPass1StableShell = memo(function CommunityMessengerRoomPass1StableShell({
  roomId,
  narrowViewport,
  composerEntryVisible,
}: CommunityMessengerRoomPass1StableShellProps) {
  return (
    <CommunityMessengerRoomStableEntryShell
      roomId={roomId}
      narrowViewport={narrowViewport}
      variant="pass1"
      composerEntryVisible={composerEntryVisible}
    />
  );
});
