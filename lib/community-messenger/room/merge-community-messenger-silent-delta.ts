import { coalesceRoomSummarySnapshotRow } from "@/lib/community-messenger/consistency/messenger-consistency-merge";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { peekGroupRoomIdentitySavedLocally } from "@/lib/community-messenger/room/group-room-identity-local-save";

/**
 * `silent_delta` 부트스트랩 응답을 기존 스냅샷 위에 얹는다 — 타임라인·멤버·trade·통화·presence 유지.
 */
export function mergeCommunityMessengerSilentDeltaIntoSnapshot(
  prev: CommunityMessengerRoomSnapshot,
  delta: CommunityMessengerRoomSnapshot
): CommunityMessengerRoomSnapshot {
  const dr = delta.room;
  const roomMerged = coalesceRoomSummarySnapshotRow(
    prev.room,
    {
      ...prev.room,
      unreadCount: dr.unreadCount,
      lastMessage: dr.lastMessage,
      lastMessageAt: dr.lastMessageAt,
      lastMessageType: dr.lastMessageType,
    },
    {
      surface: "room_bootstrap",
      roomId: prev.room.id,
      source: "silent_delta",
      eventType: "silent_delta",
    }
  );
  /**
   * D-12 ③: 서버가 1:1 상대 읽음 위치를 주면 앞으로만 반영(늦게 온 옛 값으로 되돌리지 않음).
   * 필드가 없으면(구 서버·단체방) 지금과 같다.
   */
  const rr = delta.readReceipt;
  const prevRr = prev.readReceipt;
  const readReceipt =
    rr && rr.lastReadMessageId && (!prevRr || readReceiptIsNewer(rr.lastReadAt, prevRr.lastReadAt))
      ? { ...(prevRr ?? {}), ...rr }
      : prevRr;
  return {
    ...prev,
    ...(readReceipt ? { readReceipt } : {}),
    viewerUserId: delta.viewerUserId || prev.viewerUserId,
    myRole: delta.myRole ?? prev.myRole,
    ...(Object.prototype.hasOwnProperty.call(delta, "activeCall") ? { activeCall: delta.activeCall } : {}),
    room: {
      ...prev.room,
      unreadCount: roomMerged.unreadCount,
      lastMessage: dr.lastMessage,
      lastMessageAt: dr.lastMessageAt,
      lastMessageType: dr.lastMessageType,
      isMuted: dr.isMuted,
      isPinned: dr.isPinned,
      isArchivedByViewer: dr.isArchivedByViewer,
      summary: dr.summary ?? prev.room.summary,
      contextMeta: dr.contextMeta ?? prev.room.contextMeta,
      roomStatus: dr.roomStatus ?? prev.room.roomStatus,
      isReadonly: dr.isReadonly,
      visibility: dr.visibility ?? prev.room.visibility,
      joinPolicy: dr.joinPolicy ?? prev.room.joinPolicy,
      identityPolicy: dr.identityPolicy ?? prev.room.identityPolicy,
      messengerDirectKey: dr.messengerDirectKey ?? prev.room.messengerDirectKey,
      ...groupRoomIdentityFromDelta(prev.room, dr),
    },
  };
}

/**
 * 그룹·오픈그룹 방 사진·제목 — 다른 멤버가 바꾸면 열린 방 머리글도 따라간다
 * (예전에는 unread·last* 만 덮어 머리글이 옛 사진·제목 그대로 · group-chat-full-fix-design G4).
 * 1:1 은 제목·사진을 상대 프로필로 만들므로 건드리지 않는다.
 */
function groupRoomIdentityFromDelta(
  prevRoom: CommunityMessengerRoomSnapshot["room"],
  dr: CommunityMessengerRoomSnapshot["room"]
): Partial<CommunityMessengerRoomSnapshot["room"]> {
  if (prevRoom.roomType !== "private_group" && prevRoom.roomType !== "open_group") return {};
  if (dr.roomType !== prevRoom.roomType) return {};
  /** 이 기기에서 방금 저장한 값과 다른 delta 는 캐시된 옛 응답일 수 있다 — 보호 시간 동안 덮지 않음 */
  const saved = peekGroupRoomIdentitySavedLocally(prevRoom.id);
  const out: Partial<CommunityMessengerRoomSnapshot["room"]> = {};
  /** 서버가 방 제목이 비어 대체 글자를 넣은 경우(`titleFromRoom !== true`)는 덮지 않는다 */
  const nextTitle = dr.titleFromRoom === true && typeof dr.title === "string" ? dr.title.trim() : "";
  if (nextTitle && !(saved && typeof saved.title === "string" && saved.title !== nextTitle)) {
    out.title = nextTitle;
  }
  if (Object.prototype.hasOwnProperty.call(dr, "avatarUrl")) {
    const nextAvatar = (typeof dr.avatarUrl === "string" ? dr.avatarUrl.trim() : "") || null;
    const savedAvatarDiffers =
      saved != null && Object.prototype.hasOwnProperty.call(saved, "avatarUrl") && (saved.avatarUrl ?? null) !== nextAvatar;
    if (!savedAvatarDiffers) out.avatarUrl = nextAvatar;
  }
  return out;
}

function readReceiptIsNewer(next: string | null | undefined, prev: string | null | undefined): boolean {
  const n = next ? Date.parse(next) : NaN;
  if (!Number.isFinite(n)) return false;
  const p = prev ? Date.parse(prev) : NaN;
  return !Number.isFinite(p) || n > p;
}
