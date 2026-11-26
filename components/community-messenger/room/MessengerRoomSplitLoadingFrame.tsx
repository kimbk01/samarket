"use client";

import { MessengerSplitRoomEntryFrame } from "@/components/community-messenger/room/MessengerSplitRoomEntryFrame";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";

/**
 * `rooms/[roomId]/loading.tsx` — 분할 화면(768px+)에서만 방과 같은 틀을 그린다 (설계 P1).
 * 이전에는 측정용 probe 만 있어 오른쪽 칸이 흰 빈 칸으로 보였다. 휴대폰은 아무것도 그리지 않는다(기존 그대로).
 */
export function MessengerRoomSplitLoadingFrame() {
  const isSplit = useIsMessengerSplitViewport();
  if (!isSplit) return null;
  return <MessengerSplitRoomEntryFrame dataAttrs={{ "data-cm-room-split-loading-frame": "" }} />;
}
