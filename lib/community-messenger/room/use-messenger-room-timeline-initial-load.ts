"use client";

import { useEffect, useState, type MutableRefObject } from "react";
import type { CommunityMessengerMessage, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { computeMessengerRoomTimelineInitialLoadComplete } from "@/lib/community-messenger/room/messenger-room-timeline-ssot";

/**
 * 방 진입 initial fetch 완료 — Realtime pending queue drain·paint SSOT 게이트.
 */
export function useMessengerRoomTimelineInitialLoadComplete({
  roomId,
  loadedRef,
  loading,
  roomMessages,
  snapshot,
}: {
  roomId: string;
  loadedRef: MutableRefObject<boolean>;
  loading: boolean;
  roomMessages: Array<CommunityMessengerMessage & { pending?: boolean }>;
  snapshot: CommunityMessengerRoomSnapshot | null;
}): boolean {
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    setComplete(false);
  }, [roomId]);

  useEffect(() => {
    if (complete) return;
    const next = computeMessengerRoomTimelineInitialLoadComplete({
      loaded: loadedRef.current,
      loading,
      roomMessages,
      snapshot,
    });
    if (next) setComplete(true);
  }, [complete, loadedRef, loading, roomMessages, snapshot]);

  return complete;
}
