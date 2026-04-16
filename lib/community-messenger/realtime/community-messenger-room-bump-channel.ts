/** 방 메시지 bump용 Realtime Broadcast 채널/이벤트 — 클라·서버 공통 (번들에 `use client` 없음) */

export const CM_ROOM_BUMP_BROADCAST_EVENT = "cm_room_bump";

export function communityMessengerRoomBumpChannelName(roomId: string): string {
  return `community-messenger-room-bump:${roomId.trim().toLowerCase()}`;
}
