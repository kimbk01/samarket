/**
 * Room snapshot friendship fields — Step 3 (Gate C) + Contact transition A2.
 * Design: docs/community-messenger/friendship-ssot-design.md
 *
 * Maps `resolveFriendshipPair` output to snapshot friendship projection only.
 * `pendingFriendshipRequestId` is never populated — legacy pending UI removed (P2/P4).
 */

import {
  peerFriendshipStateFromResolution,
  type FriendshipPairResolution,
} from "@/lib/community-messenger/friendship-resolver";
import type {
  FriendshipDirection,
  ResolveFriendshipPairResult,
} from "@/lib/community-messenger/friendship/resolve-friendship-pair";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

export type RoomSnapshotFriendshipProjection = {
  peerFriendshipState: NonNullable<CommunityMessengerRoomSnapshot["peerFriendshipState"]>;
  friendshipDirection: FriendshipDirection;
  /** @deprecated Contact transition — never set; kept for service.ts read compatibility. */
  pendingFriendshipRequestId?: string;
};

export function friendshipPairResolutionFromResolved(
  resolved: ResolveFriendshipPairResult
): FriendshipPairResolution {
  return {
    state: resolved.state,
    source: resolved.source,
    row: resolved.row,
  };
}

/** Pure projection — snapshot friendship fields from resolver result only. */
export function projectRoomSnapshotFriendshipFromResolution(
  resolved: ResolveFriendshipPairResult
): RoomSnapshotFriendshipProjection {
  const peerFriendshipState = peerFriendshipStateFromResolution(
    friendshipPairResolutionFromResolved(resolved)
  );
  return {
    peerFriendshipState,
    friendshipDirection: resolved.direction,
  };
}
