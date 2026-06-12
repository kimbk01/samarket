"use client";

import { useLayoutEffect } from "react";
import { noteBn14DirectColdMark } from "@/lib/community-messenger/room/cm-room-bn14-direct-cold-probe";
import { runCmRoomLayoutShellClientBridge } from "@/lib/community-messenger/room/cm-room-layout-shell-client-bridge";

if (typeof window !== "undefined") {
  noteBn14DirectColdMark("segment_layout_module_eval");
}

/**
 * BN14-2 — warm/prefetch 경로용 layout shell bridge (canonical shell 은 server inline).
 */
export function CommunityMessengerRoomLayoutShellClientBridge({ roomId }: { roomId: string }) {
  useLayoutEffect(() => {
    runCmRoomLayoutShellClientBridge(roomId);
  }, [roomId]);

  return null;
}
