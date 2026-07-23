"use client";

import { useLayoutEffect } from "react";
import { useMessengerRoomClientPhase1Context } from "@/lib/community-messenger/room/messenger-room-client-phase1-context";
import { markCmRoomSubtreeEntryPassAdvanced } from "@/lib/community-messenger/room/cm-room-subtree-stability";
import CommunityMessengerRoomClientPhase2Body from "@/components/community-messenger/room/CommunityMessengerRoomClientPhase2Body";

/**
 * Gate가 authoritative seed로 마운트한 뒤 — Body 즉시.
 * DO NOT: Pass2 idle 120ms / seed 없는 spinner 재대기 (불필요 체감 지연).
 */
export function CommunityMessengerRoomClientPhase2() {
  const phase1 = useMessengerRoomClientPhase1Context();
  const roomId = phase1.roomId?.trim() ?? "";

  useLayoutEffect(() => {
    if (roomId) markCmRoomSubtreeEntryPassAdvanced(roomId);
  }, [roomId]);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        data-cm-room-phase2-persistent=""
        data-cm-room-entry-pass="1"
      >
        <CommunityMessengerRoomClientPhase2Body />
      </div>
    </div>
  );
}
