import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";

type CallLogPeerRow = {
  callerUserId?: string | null;
  peerUserId?: string | null;
};

type CallLogSessionPeerHint = {
  initiatorUserId?: string | null;
  recipientUserId?: string | null;
};

/**
 * 통화 목록·상세에서 **뷰어 기준 상대방** user id.
 * DB `peer_user_id` 는 발신(recipient) 관점 키라 수신·실패 행에서 뷰어 id 가 들어올 수 있다 — UI 에는 항상 상대만 노출.
 */
export function resolveCallLogDisplayPeerUserId(
  viewerUserId: string,
  row: CallLogPeerRow,
  hints?: {
    session?: CallLogSessionPeerHint | null;
    roomPeerUserId?: string | null;
  }
): string | null {
  const viewer = viewerUserId.trim();
  if (!viewer) return null;

  const callerId = row.callerUserId?.trim() || null;
  const storedPeerId = row.peerUserId?.trim() || null;

  if (storedPeerId && !messengerUserIdsEqual(storedPeerId, viewer)) return storedPeerId;
  if (callerId && !messengerUserIdsEqual(callerId, viewer)) return callerId;

  const session = hints?.session;
  if (session) {
    const initiator = session.initiatorUserId?.trim() || null;
    const recipient = session.recipientUserId?.trim() || null;
    if (initiator && !messengerUserIdsEqual(initiator, viewer)) return initiator;
    if (recipient && !messengerUserIdsEqual(recipient, viewer)) return recipient;
  }

  const roomPeer = hints?.roomPeerUserId?.trim() || null;
  if (roomPeer && !messengerUserIdsEqual(roomPeer, viewer)) return roomPeer;

  return storedPeerId ?? callerId;
}
