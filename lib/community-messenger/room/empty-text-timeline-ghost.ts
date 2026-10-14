import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

type RoomMsg = CommunityMessengerMessage & { pending?: boolean };

/**
 * 빈 text 고스트 — 미전송·불완전 RT placeholder.
 * pending(optimistic)·전원삭제 tombstone·비 text 는 표시 유지.
 */
export function isEmptyTextTimelineGhost(m: RoomMsg): boolean {
  return (
    m.messageType === "text" &&
    !m.pending &&
    !String(m.content ?? "").trim() &&
    !String(m.deletedForEveryoneAt ?? "").trim()
  );
}
