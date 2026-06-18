/**
 * Kakao-style peer relation label — 통화 gate·목록 배지·경고 문구 SSOT.
 * accepted friend는 통화 조건이 아니라 표시/친구 목록 분류에만 사용한다.
 */

import type { FriendshipPairResolution } from "@/lib/community-messenger/friendship-resolver";

export type PeerRelationLabel =
  | "stranger"
  | "saved_by_me"
  | "saved_by_peer"
  | "mutual_friend"
  | "blocked";

export type PeerRelationLabelInput = {
  blockedEitherWay: boolean;
  blockedByMe?: boolean;
  savedByMe: boolean;
  savedByPeer: boolean;
  friendship?: FriendshipPairResolution | null;
};

/** mutual = friendships accepted 또는 양쪽 friend 저장 */
export function resolvePeerRelationLabel(input: PeerRelationLabelInput): PeerRelationLabel {
  if (input.blockedEitherWay || input.blockedByMe) return "blocked";
  const friendshipState = input.friendship?.state;
  if (friendshipState === "blocked") return "blocked";

  const mutualFromFriendship = friendshipState === "accepted";
  const mutualFromSaves = input.savedByMe && input.savedByPeer;
  if (mutualFromFriendship || mutualFromSaves) return "mutual_friend";
  if (input.savedByMe) return "saved_by_me";
  if (input.savedByPeer) return "saved_by_peer";
  return "stranger";
}

export function isMutualFriendRelationLabel(label: PeerRelationLabel): boolean {
  return label === "mutual_friend";
}

export function shouldShowStrangerPeerWarning(label: PeerRelationLabel): boolean {
  return label !== "mutual_friend" && label !== "saved_by_me" && label !== "blocked";
}
