"use client";

import { MessengerSplitRoomEntryFrame } from "@/components/community-messenger/room/MessengerSplitRoomEntryFrame";

/**
 * `rooms/[roomId]/loading.tsx` — 방 화면을 불러오는 동안 방과 같은 틀(상단바 + 대화 배경)을 그린다.
 * 분할 화면(설계 P1)에 더해 앱 진입 SSOT C2(2026-11-26)로 휴대폰도 같다 — 휴대폰은 전에 아무것도 그리지 않아
 * 알림·복원 진입에서 OS 화면이 경로 도착 첫 프레임에 걷힐 때(C1′) 빈 화면이 보일 수 있었다.
 */
export function MessengerRoomSplitLoadingFrame() {
  return <MessengerSplitRoomEntryFrame dataAttrs={{ "data-cm-room-split-loading-frame": "" }} />;
}
