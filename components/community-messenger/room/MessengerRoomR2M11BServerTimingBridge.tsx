"use client";

import { useLayoutEffect } from "react";
import { useParams } from "next/navigation";
import { noteR2M11BRoomPageServerWallMs } from "@/lib/community-messenger/room/cm-room-r2-m11b-breakdown";
import { noteR2M11CRoomSegmentServerTiming } from "@/lib/community-messenger/room/cm-room-r2-m11c-breakdown";
import type { R2M11CRoomSegmentServerPayload } from "@/lib/community-messenger/room/cm-room-r2-m11c-layout-server-timers";

/** R2-M11B / R2-M11C — room `page.tsx` 서버 동기 구간(start/done)만. */
export function MessengerRoomR2M11BServerTimingBridge({
  roomPageServerWallMs,
  roomSegmentTiming,
}: {
  roomPageServerWallMs: number;
  roomSegmentTiming: R2M11CRoomSegmentServerPayload;
}) {
  const params = useParams();
  const roomId = String(params?.roomId ?? "").trim();

  useLayoutEffect(() => {
    if (!roomId) return;
    noteR2M11BRoomPageServerWallMs(roomId, roomPageServerWallMs);
    noteR2M11CRoomSegmentServerTiming(roomId, roomSegmentTiming);
  }, [roomId, roomPageServerWallMs, roomSegmentTiming]);

  return null;
}
