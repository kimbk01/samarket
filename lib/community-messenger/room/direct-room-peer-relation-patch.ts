import type { FriendshipDirection } from "@/lib/community-messenger/friendship/resolve-friendship-pair";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

/** §17-5 R-4: `GET /rooms/[roomId]/peer-relation` 응답 — 서버 `resolveDirectRoomPeerRelation` 과 같은 모양 */
export type DirectRoomPeerRelation = {
  peerFriendshipState: NonNullable<CommunityMessengerRoomSnapshot["peerFriendshipState"]>;
  friendshipDirection: FriendshipDirection;
  pendingFriendshipRequestId: string | null;
  directMessageDenied: "blocked" | "rejected_by_peer" | null;
  peerBlockedByMe: boolean;
};

/**
 * 방 스냅샷에 관계 값만 덮는다 — 타임라인·방 정보·통화 권한(`directCallGate`)은 그대로.
 * 값이 같으면 같은 객체를 돌려줘 불필요한 다시 그리기를 막는다.
 */
export function patchRoomSnapshotPeerRelation(
  prev: CommunityMessengerRoomSnapshot,
  peerUserId: string,
  relation: DirectRoomPeerRelation
): CommunityMessengerRoomSnapshot {
  const peer = peerUserId.trim();
  if (!peer) return prev;
  const pendingId = relation.pendingFriendshipRequestId?.trim() || undefined;
  const isFriend = relation.peerFriendshipState === "accepted";
  const memberChanged = prev.members.some(
    (m) => m.id === peer && (Boolean(m.blocked) !== relation.peerBlockedByMe || Boolean(m.isFriend) !== isFriend)
  );
  const unchanged =
    !memberChanged &&
    prev.peerFriendshipState === relation.peerFriendshipState &&
    prev.friendshipDirection === relation.friendshipDirection &&
    prev.pendingFriendshipRequestId === pendingId &&
    (prev.directMessageDenied ?? null) === relation.directMessageDenied;
  if (unchanged) return prev;
  return {
    ...prev,
    members: memberChanged
      ? prev.members.map((m) => (m.id === peer ? { ...m, blocked: relation.peerBlockedByMe, isFriend } : m))
      : prev.members,
    peerFriendshipState: relation.peerFriendshipState,
    friendshipDirection: relation.friendshipDirection,
    pendingFriendshipRequestId: pendingId,
    directMessageDenied: relation.directMessageDenied,
  };
}

export function parseDirectRoomPeerRelation(raw: unknown): DirectRoomPeerRelation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const state = r.peerFriendshipState;
  if (state !== "accepted" && state !== "pending" && state !== "none" && state !== "blocked") return null;
  const direction = r.friendshipDirection;
  if (typeof direction !== "string") return null;
  const denied = r.directMessageDenied;
  if (denied !== null && denied !== "blocked" && denied !== "rejected_by_peer") return null;
  return {
    peerFriendshipState: state,
    friendshipDirection: direction as FriendshipDirection,
    pendingFriendshipRequestId: typeof r.pendingFriendshipRequestId === "string" ? r.pendingFriendshipRequestId : null,
    directMessageDenied: denied,
    peerBlockedByMe: r.peerBlockedByMe === true,
  };
}
