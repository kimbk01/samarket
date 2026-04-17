"use client";

import { useEffect } from "react";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";

/**
 * 통화 종료 후 탭 복귀 시 스냅샷 정합, 멀티탭에서 동일 방 메시지 시 증분 catch-up.
 * `useMessengerRoomClientPhase1` 의 visibility / bus `useEffect` 쌍을 그대로 분리.
 */
export function useMessengerRoomVisibilityBusCatchup({
  roomId,
  streamRoomId,
  catchUpNewerMessages,
  refresh,
}: {
  roomId: string;
  streamRoomId: string;
  catchUpNewerMessages: () => Promise<boolean>;
  refresh: (silent?: boolean) => Promise<void>;
}): void {
  /** 통화 종료 직후 다른 탭에서 돌아올 때 스냅샷(activeCall)이 잠깐 옛값이면 배너가 남는 경우 완화 */
  useEffect(() => {
    let lastBumpAt = 0;
    const bump = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastBumpAt < 2000) return; // burst 1~2 + cooldown
      lastBumpAt = now;
      void catchUpNewerMessages();
      void refresh(true);
    };
    document.addEventListener("visibilitychange", bump);
    window.addEventListener("pageshow", bump);
    return () => {
      document.removeEventListener("visibilitychange", bump);
      window.removeEventListener("pageshow", bump);
    };
  }, [catchUpNewerMessages, refresh]);

  // Multi-tab: another tab sent a message in this room -> catch up quickly without full reload storms.
  useEffect(() => {
    const route = roomId?.trim();
    const stream = streamRoomId?.trim();
    if (!route && !stream) return;
    let lastAt = 0;
    return onCommunityMessengerBusEvent((ev) => {
      const evr = ev.roomId.trim();
      if (evr !== route && evr !== stream) return;
      const now = Date.now();
      if (now - lastAt < 1500) return;
      lastAt = now;
      void catchUpNewerMessages();
      void refresh(true);
    });
  }, [catchUpNewerMessages, refresh, roomId, streamRoomId]);
}
