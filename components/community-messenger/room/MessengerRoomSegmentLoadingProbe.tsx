"use client";

import { useLayoutEffect } from "react";
import { noteR2M11SegmentLoadingFallbackVisible } from "@/lib/community-messenger/room/cm-room-r2-m11-suspense-release";

/** `rooms/[roomId]/loading.tsx` 세그먼트 Suspense fallback 진입 (R2-M11). */
export function MessengerRoomSegmentLoadingProbe() {
  useLayoutEffect(() => {
    noteR2M11SegmentLoadingFallbackVisible();
  }, []);
  return null;
}
