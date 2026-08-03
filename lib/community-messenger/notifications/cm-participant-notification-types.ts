/**
 * `full`: 메신저 허브 — 사운드·배너·데스크톱 알림.
 * `hub_sync_only`: 비허브(마켓·방 등) — participants Realtime + 허브/뱃지/room bump + list cache.
 * increase 시 알림음·배너·데스크톱도 schedule 하되, 같은 방·포커스 음소거는 full effects 가 처리.
 */
export type MessageNotificationBridgePlayback = "full" | "hub_sync_only";

export type ParticipantRealtimeRow = {
  room_id?: unknown;
  unread_count?: unknown;
  store_order_role?: unknown;
};

export function getParticipantRoomId(row: ParticipantRealtimeRow | null): string {
  return typeof row?.room_id === "string" ? row.room_id : "";
}

export function getParticipantUnreadCount(row: ParticipantRealtimeRow | null): number {
  const value = typeof row?.unread_count === "number" ? row.unread_count : Number(row?.unread_count ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function getParticipantStoreOrderRole(
  row: ParticipantRealtimeRow | null
): "customer" | "owner" | null {
  return row?.store_order_role === "customer" || row?.store_order_role === "owner"
    ? row.store_order_role
    : null;
}
