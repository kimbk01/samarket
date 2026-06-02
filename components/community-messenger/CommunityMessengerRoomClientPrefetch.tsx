"use client";

import { useEffect } from "react";
import { scheduleWhenBrowserIdle, cancelScheduledWhenBrowserIdle } from "@/lib/ui/network-policy";

/** 방 클라이언트 동적 청크 — 목록·탭 탭 직전에도 호출 가능 */
export function preloadCommunityMessengerRoomClientChunk(): void {
  if (typeof window === "undefined") return;
  void import("@/components/community-messenger/CommunityMessengerRoomClient");
}

/**
 * `/community-messenger` 레이아웃 마운트 후 유휴 시 방 페이지 동적 청크를 미리 받아
 * 첫 방 입장 시 JS 파싱·로드 대기를 줄인다.
 */
export function CommunityMessengerRoomClientPrefetch() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const idleId = scheduleWhenBrowserIdle(() => {
      preloadCommunityMessengerRoomClientChunk();
    }, 120);
    return () => cancelScheduledWhenBrowserIdle(idleId);
  }, []);
  return null;
}
