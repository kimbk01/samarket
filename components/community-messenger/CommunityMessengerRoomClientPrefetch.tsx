"use client";

import { useEffect } from "react";
import { warmCommunityMessengerRoomRouteChunks } from "@/lib/community-messenger/room/cm-room-route-chunk-warm";
import { scheduleWhenBrowserIdle, cancelScheduledWhenBrowserIdle } from "@/lib/ui/network-policy";

/** @deprecated — use warmCommunityMessengerRoomRouteChunks */
export function preloadCommunityMessengerRoomClientChunk(): void {
  warmCommunityMessengerRoomRouteChunks("cm_layout_idle", { layoutOnly: false });
}

/** room page client entry + inner + layout — CM 세그먼트 한정 warm (앱 셸 전역 아님) */
export function preloadCommunityMessengerRoomRouteEntryChunks(): void {
  warmCommunityMessengerRoomRouteChunks("cm_layout_idle");
}

/**
 * `/community-messenger` 레이아웃 마운트 후 유휴 시 방 페이지 동적 청크를 미리 받아
 * 첫 방 입장 시 JS 파싱·로드 대기를 줄인다.
 */
export function CommunityMessengerRoomClientPrefetch() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    queueMicrotask(() => {
      warmCommunityMessengerRoomRouteChunks("cm_layout_idle", { layoutOnly: true });
    });
    const idleId = scheduleWhenBrowserIdle(() => {
      warmCommunityMessengerRoomRouteChunks("cm_layout_idle");
    }, 50);
    return () => cancelScheduledWhenBrowserIdle(idleId);
  }, []);
  return null;
}
