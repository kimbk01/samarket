/** `full`: 사운드·배너·데스크톱 알림. `hub_sync_only`: participants Realtime + 허브/뱃지/room bump 만(비메신저 표면). */
export type MessageNotificationBridgePlayback = "full" | "hub_sync_only";

export type ParticipantRealtimeRow = {
  room_id?: unknown;
  unread_count?: unknown;
};

export function getParticipantRoomId(row: ParticipantRealtimeRow | null): string {
  return typeof row?.room_id === "string" ? row.room_id : "";
}

export function getParticipantUnreadCount(row: ParticipantRealtimeRow | null): number {
  const value = typeof row?.unread_count === "number" ? row.unread_count : Number(row?.unread_count ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
