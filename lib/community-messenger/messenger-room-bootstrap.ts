import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

/**
 * 방 입장 단일 부트스트랩 GET — room + members + 최근 메시지 + 시청자 unread(room.unreadCount).
 * 서버: `getCommunityMessengerRoomSnapshot` + `COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT`.
 */
export function communityMessengerRoomBootstrapPath(roomId: string): string {
  return `/api/community-messenger/rooms/${encodeURIComponent(roomId.trim())}/bootstrap`;
}

/** PATCH / `app/api/community-messenger/rooms/[roomId]/route.ts` — mute·archive·그룹 설정 등 */
export function communityMessengerRoomResourcePath(roomId: string): string {
  return `/api/community-messenger/rooms/${encodeURIComponent(roomId.trim())}`;
}

/** GET `app/api/community-messenger/rooms/[roomId]/members` — 참가자 offset 페이지 */
export function communityMessengerRoomMembersPath(roomId: string): string {
  return `/api/community-messenger/rooms/${encodeURIComponent(roomId.trim())}/members`;
}

/** 부트스트랩·`GET /rooms/[id]` 공통 JSON → 스냅샷 (`ok`·`bootstrap`·`viewerUnreadCount` 제거) */
export function parseCommunityMessengerRoomSnapshotResponse(json: unknown): CommunityMessengerRoomSnapshot | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (o.ok !== true) return null;
  if (typeof o.viewerUserId !== "string" || !o.viewerUserId.trim()) return null;
  const {
    bootstrap: _b,
    viewerUnreadCount: _u,
    ok: _ok,
    v: _v,
    domain: _domain,
    unread: _unread,
    ...snap
  } = o;
  return snap as CommunityMessengerRoomSnapshot;
}
