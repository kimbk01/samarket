"use client";

/**
 * 메신저 홈·알림 경로에서 공유 — **Supabase 구독 추가 없음**.
 * 포커스 중인 방(원장 `room_id`)과 서버 unread 도착 전 낙관적 증가분만 추적한다.
 */

const messengerRealtimeFocusedRoomIdNormRef = { current: null as string | null };
const messengerHomeLocalUnreadDeltaByRoom = new Map<string, number>();

export function setMessengerRealtimeFocusedRoomId(roomId: string | null): void {
  messengerRealtimeFocusedRoomIdNormRef.current = roomId?.trim().toLowerCase() || null;
}

export function getMessengerRealtimeFocusedRoomIdNorm(): string | null {
  return messengerRealtimeFocusedRoomIdNormRef.current;
}

export function clearMessengerRealtimeLocalUnreadForRoom(roomId: string): void {
  messengerHomeLocalUnreadDeltaByRoom.delete(String(roomId ?? "").trim().toLowerCase());
}

export function bumpMessengerRealtimeLocalUnreadForRoom(roomId: string): void {
  const k = String(roomId ?? "").trim().toLowerCase();
  if (!k) return;
  messengerHomeLocalUnreadDeltaByRoom.set(k, (messengerHomeLocalUnreadDeltaByRoom.get(k) ?? 0) + 1);
}

export function takeMessengerRealtimeLocalUnreadDeltaForRoom(roomId: string): number {
  const k = String(roomId ?? "").trim().toLowerCase();
  if (!k) return 0;
  const v = messengerHomeLocalUnreadDeltaByRoom.get(k) ?? 0;
  messengerHomeLocalUnreadDeltaByRoom.delete(k);
  return v;
}
