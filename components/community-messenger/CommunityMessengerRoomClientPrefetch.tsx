"use client";

import { useEffect } from "react";
import { scheduleWhenBrowserIdle, cancelScheduledWhenBrowserIdle } from "@/lib/ui/network-policy";

/**
 * `/community-messenger` 레이아웃 마운트 후 유휴 시 방 페이지 동적 청크를 미리 받아
 * 첫 방 입장 시 JS 파싱·로드 대기를 줄인다.
 */
export function CommunityMessengerRoomClientPrefetch() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const idleId = scheduleWhenBrowserIdle(() => {
      void import("@/components/community-messenger/CommunityMessengerRoomClient");
    }, 900);
    return () => cancelScheduledWhenBrowserIdle(idleId);
  }, []);
  return null;
}
