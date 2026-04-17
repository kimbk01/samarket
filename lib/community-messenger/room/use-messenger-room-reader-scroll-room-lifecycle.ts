"use client";

import { useEffect } from "react";
import { messengerRolloutUsesRoomScrollHints } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";

/**
 * 방 전환 시 reader 스크롤 힌트 초기화·기본 at-bottom.
 * `useMessengerRoomClientPhase1` 상단 effect 본문·deps 그대로 — 호출 순서 유지 필수.
 */
export function useMessengerRoomReaderScrollRoomLifecycle({ roomId }: { roomId: string }): void {
  useEffect(() => {
    const id = roomId?.trim();
    return () => {
      if (id && messengerRolloutUsesRoomScrollHints()) {
        useMessengerRoomReaderStateStore.getState().clearRoom(id);
      }
    };
  }, [roomId]);

  useEffect(() => {
    const id = roomId?.trim();
    if (!id || !messengerRolloutUsesRoomScrollHints()) return;
    useMessengerRoomReaderStateStore.getState().setScrollPosition(id, "at-bottom");
  }, [roomId]);
}
