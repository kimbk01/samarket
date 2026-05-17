"use client";

import { useLayoutEffect } from "react";
import { noteR2M9Stage } from "@/lib/community-messenger/room/cm-room-r2-m9-entry-profile";
import { noteR2M11SuspenseRelease } from "@/lib/community-messenger/room/cm-room-r2-m11-suspense-release";
import {
  noteR2M11BFlightResponseDone,
  noteR2M11BSuspenseRelease,
  pickRoomFlightResourceTiming,
  tryCaptureR2M11BFlightFromPerformance,
} from "@/lib/community-messenger/room/cm-room-r2-m11b-breakdown";
import { readR2M11BRouteChangeStartAt } from "@/lib/community-messenger/room/cm-room-r2-m11b-breakdown";
import { tryEmitR2M11CAfterM11BPhase } from "@/lib/community-messenger/room/cm-room-r2-m11c-breakdown";
import { noteR2M11DRoomSuspenseRelease } from "@/lib/community-messenger/room/cm-room-r2-m11d-prefetch-flight";

/** room page client 본문 커밋 — Suspense release (R2-M9 / R2-M11). */
export function MessengerRoomR2M9SuspenseProbe({ roomId }: { roomId: string }) {
  useLayoutEffect(() => {
    const rid = roomId.trim();
    noteR2M9Stage("suspense_release");
    if (rid) {
      tryCaptureR2M11BFlightFromPerformance(rid);
      const routeT0 = readR2M11BRouteChangeStartAt(rid);
      if (routeT0 != null) {
        const entry = pickRoomFlightResourceTiming(rid, routeT0);
        if (entry) {
          const end =
            entry.responseEnd > 0 ? entry.responseEnd : entry.startTime + entry.duration;
          noteR2M11BFlightResponseDone(rid, end);
        }
      }
      noteR2M11SuspenseRelease(rid);
      noteR2M11BSuspenseRelease(rid);
      noteR2M11DRoomSuspenseRelease(rid);
      tryEmitR2M11CAfterM11BPhase(rid);
    }
  }, [roomId]);
  return null;
}
