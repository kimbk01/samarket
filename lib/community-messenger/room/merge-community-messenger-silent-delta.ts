import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import {
  resolveMessengerUnreadMerge,
} from "@/lib/community-messenger/consistency/messenger-consistency-merge";

/**
 * `silent_delta` 부트스트랩 응답을 기존 스냅샷 위에 얹는다 — 타임라인·멤버·trade·통화·presence 유지.
 */
export function mergeCommunityMessengerSilentDeltaIntoSnapshot(
  prev: CommunityMessengerRoomSnapshot,
  delta: CommunityMessengerRoomSnapshot
): CommunityMessengerRoomSnapshot {
  const dr = delta.room;
  const incomingLm = String(dr.lastMessageAt ?? "");
  const unreadResolved = resolveMessengerUnreadMerge({
    surface: "room_bootstrap",
    roomId: prev.room.id,
    incomingUnread: dr.unreadCount,
    incomingLastMessageAt: incomingLm,
    source: "silent_delta",
    eventType: "silent_delta",
    prevUnread: prev.room.unreadCount,
  });
  return {
    ...prev,
    viewerUserId: delta.viewerUserId || prev.viewerUserId,
    myRole: delta.myRole ?? prev.myRole,
    room: {
      ...prev.room,
      unreadCount: unreadResolved.unreadCount,
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
