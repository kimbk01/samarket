"use client";

import { useEffect } from "react";
import { messengerRolloutUsesRoomScrollHints } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";

/**
 * 방 전환 시 reader badge 힌트만 정리.
 * scrollTop persist는 ScrollAnchorController 가 unmount 시 저장 — at-bottom 강제 없음.
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
}
