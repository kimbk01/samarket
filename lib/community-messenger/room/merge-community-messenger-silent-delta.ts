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
    },
  };
}

function readReceiptIsNewer(next: string | null | undefined, prev: string | null | undefined): boolean {
  const n = next ? Date.parse(next) : NaN;
  if (!Number.isFinite(n)) return false;
  const p = prev ? Date.parse(prev) : NaN;
  return !Number.isFinite(p) || n > p;
}
