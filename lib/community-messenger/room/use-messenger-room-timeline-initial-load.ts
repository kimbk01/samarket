"use client";

import { useLayoutEffect, useState, type MutableRefObject } from "react";
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

  /**
   * layout effect — 완료 판정을 첫 화면 그리기 전에 반영해, 맨 아래 앵커(layoutEffect)가 같은 프레임에 적용되게 한다.
   * passive effect 였을 때는 첫 프레임이 맨 위(오래된 메시지)로 그려졌다가 다음 커밋에 맨 아래로 튀는 깜빡임이 있었다.
   */
  useLayoutEffect(() => {
    setComplete(false);
  }, [roomId]);

  useLayoutEffect(() => {
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
