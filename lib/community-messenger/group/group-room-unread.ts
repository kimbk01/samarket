import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";

export type MarkGroupRoomReadResult = { ok: boolean; error?: string };

/**
 * 읽음 SSOT — `markCommunityMessengerRoomAsRead` 가 있으면 위임, 없으면 stub.
 */
export async function markGroupRoomRead(input: {
  userId: string;
  roomId: string;
  lastReadMessageId?: string;
  flushOpen?: boolean;
}): Promise<MarkGroupRoomReadResult> {
  try {
    const mod = await import("@/lib/community-messenger/service");
    if (typeof mod.markCommunityMessengerRoomAsRead !== "function") {
      return { ok: false, error: GROUP_ROOM_ERROR.MARK_READ_UNAVAILABLE };
    }
    const result = await mod.markCommunityMessengerRoomAsRead({
      userId: input.userId,
      roomId: input.roomId,
      lastReadMessageId: input.lastReadMessageId,
      flushOpen: input.flushOpen,
    });
    if (!result.ok) return { ok: false, error: result.error ?? GROUP_ROOM_ERROR.MARK_READ_UNAVAILABLE };
    return { ok: true };
  } catch {
    return { ok: false, error: GROUP_ROOM_ERROR.MARK_READ_UNAVAILABLE };
  }
}
