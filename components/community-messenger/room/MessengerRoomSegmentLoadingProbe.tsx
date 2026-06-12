"use client";

import { useLayoutEffect } from "react";
import { useParams } from "next/navigation";
import { noteBn14DirectColdMark } from "@/lib/community-messenger/room/cm-room-bn14-direct-cold-probe";
import { runCmRoomLayoutShellClientBridge } from "@/lib/community-messenger/room/cm-room-layout-shell-client-bridge";

/** `rooms/[roomId]/loading.tsx` 세그먼트 Suspense fallback 진입 (R2-M11). */
export function MessengerRoomSegmentLoadingProbe() {
  const rid = String(useParams()?.roomId ?? "").trim();

  useLayoutEffect(() => {
    noteBn14DirectColdMark("segment_loading_probe_mount");
    if (rid) runCmRoomLayoutShellClientBridge(rid);
  }, [rid]);

  return <span data-cm-room-segment-loading-probe="" aria-hidden className="hidden" />;
}
