import { coalesceRoomSummarySnapshotRow } from "@/lib/community-messenger/consistency/messenger-consistency-merge";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

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
  return {
    ...prev,
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
    },
  };
}
